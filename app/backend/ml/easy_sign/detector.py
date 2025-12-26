from __future__ import annotations

import os
import time
import math
from pathlib import Path
from collections import deque, Counter
from typing import Optional, Tuple, Any

import numpy as np
import mediapipe as mp

# -------------------------
# Константы (из test.py)
# -------------------------

PIP_DIP_CURLED_THR = 165    # если < этого угла -> палец считаем согнутым
THUMB_IP_FLEX_THR = 165     # большой согнут, если угол в IP < этого

# Нормированные расстояния (делим на "размер ладони", чтобы не зависеть от масштаба)
TIP_TO_MCP_CURLED_THR = 0.75   # tip рядом со своей "основанием" (MCP) -> палец согнут
FIST_COMPACT_THR = 1.10        # все пальцы "в куче" (tips близко к запястью) — доп.стабилизация

THUMB_TUCK_TOUCH_THR = 0.90    # кончик большого рядом с кулаком (например, около index/middle MCP)

# Сглаживание результата
HIST_LEN = 7
HIST_MIN_VOTES = 4

DEBUG = False

def angle2d(a, b, c):
    """Угол ABC в градусах (в точке b) по 2D координатам."""
    bax, bay = a[0] - b[0], a[1] - b[1]
    bcx, bcy = c[0] - b[0], c[1] - b[1]
    ab = math.hypot(bax, bay)
    cb = math.hypot(bcx, bcy)
    if ab < 1e-6 or cb < 1e-6:
        return 180.0
    cosv = (bax * bcx + bay * bcy) / (ab * cb)
    cosv = max(-1.0, min(1.0, cosv))
    return math.degrees(math.acos(cosv))

def angle_between(v1, v2):
    dot = np.dot(v1, v2)
    n1 = np.linalg.norm(v1) + 1e-9
    n2 = np.linalg.norm(v2) + 1e-9
    cosv = max(-1.0, min(1.0, dot / (n1 * n2)))
    return math.degrees(math.acos(cosv))

def angle_3d(a, b, c):
    """Угол ABC (в градусах) по 3 точкам a,b,c. a,b,c = (x,y,z)."""
    bax = a[0] - b[0]; bay = a[1] - b[1]; baz = a[2] - b[2]
    bcx = c[0] - b[0]; bcy = c[1] - b[1]; bcz = c[2] - b[2]
    dot = bax*bcx + bay*bcy + baz*bcz
    na = math.sqrt(bax*bax + bay*bay + baz*baz) + 1e-9
    nc = math.sqrt(bcx*bcx + bcy*bcy + bcz*bcz) + 1e-9
    cosv = max(-1.0, min(1.0, dot/(na*nc)))
    return math.degrees(math.acos(cosv))

def dist_3d(a, b):
    """Евклидово расстояние между (x,y,z)."""
    dx = a[0]-b[0]; dy = a[1]-b[1]; dz = a[2]-b[2]
    return math.sqrt(dx*dx + dy*dy + dz*dz)

def lms_to_xyz(hand_landmarks):
    """hand_landmarks: список из 21 landmark -> [(x,y,z), ...]"""
    return [(lm.x, lm.y, lm.z) for lm in hand_landmarks]

def palm_scale(xyz):
    """
    Масштаб ладони (для нормализации расстояний).
    Берём расстояние wrist(0) -> middle_mcp(9) (стабильная базовая длина).
    """
    return dist_3d(xyz[0], xyz[9]) + 1e-9

def ndist(xyz, i, j):
    """Нормированное расстояние между точками i и j: dist / scale."""
    s = palm_scale(xyz)
    return dist_3d(xyz[i], xyz[j]) / s

def lm_to_xyz(hand_landmarks):
    return [(lm.x, lm.y, lm.z) for lm in hand_landmarks]

def dist2(p, q):
    return math.sqrt((p[0]-q[0])**2 + (p[1]-q[1])**2)

def hand_scale(xyz):
    return dist2(xyz[0], xyz[9]) + 1e-9

def finger_extended(xyz, mcp, pip, dip, tip, thr=170):
    ang_pip = angle_3d(xyz[mcp], xyz[pip], xyz[dip])
    ang_dip = angle_3d(xyz[pip], xyz[dip], xyz[tip])
    return (ang_pip > thr) and (ang_dip > thr)

def palm_is_sideways(xyz):
    """
    True, если ладонь повернута БОКОМ к камере,
    False — если ладонь смотрит в камеру.
    """
    p0 = np.array(xyz[0])   # wrist
    p5 = np.array(xyz[5])   # index MCP
    p17 = np.array(xyz[17]) # pinky MCP

    # два вектора в плоскости ладони
    v1 = p5 - p0
    v2 = p17 - p0

    # нормаль к плоскости ладони
    normal = np.cross(v1, v2)

    # нас интересует соотношение X и Z
    nx, ny, nz = abs(normal[0]), abs(normal[1]), abs(normal[2])

    # если Z доминирует → ладонь к камере ❌
    # если X доминирует → ладонь боком ✅
    return nx > nz

def vec_0_17_along_y(xyz, max_angle_deg=12, enforce_up=True, min_len_nd=0.30):
    """
    True, если вектор wrist(0)->pinky_mcp(17) почти вертикален (вдоль оси Y).

    max_angle_deg: чем меньше — тем строже вертикаль
    enforce_up=True: требует, чтобы 17 был ВЫШЕ 0 (dy < 0), т.е. "вверх"
    min_len_nd: защита от шума, если рука слишком далеко/плохо детектится
    """
    dx = xyz[17][0] - xyz[0][0]
    dy = xyz[17][1] - xyz[0][1]

    if enforce_up and not (dy < 0):
        return False

    # нормированная длина (чтобы не ловить мусор при плохом детекте)
    s = palm_scale(xyz)
    vlen = math.sqrt(dx*dx + dy*dy) / (s + 1e-9)
    if vlen < min_len_nd:
        return False

    # угол к оси Y: cos = |dy| / |v|
    cosv = abs(dy) / (math.sqrt(dx*dx + dy*dy) + 1e-9)
    cosv = max(-1.0, min(1.0, cosv))
    ang = math.degrees(math.acos(cosv))
    return ang <= max_angle_deg

def wrist_not_bent(xyz, thr_z=0.07, thr_ny=0.60):
    """
    Приближённая проверка "кисть не согнута":
    - ладонь не наклонена сильно вверх/вниз (|normal_y| небольшой)
    - запястье по Z близко к костяшкам (нет сильного залома к/от камеры)

    thr_z  подстройка 0.05–0.10
    thr_ny подстройка 0.45–0.75 (меньше = строже)
    """
    p0 = np.array(xyz[0])   # wrist
    p5 = np.array(xyz[5])   # index MCP
    p17 = np.array(xyz[17]) # pinky MCP

    v1 = p5 - p0
    v2 = p17 - p0
    normal = np.cross(v1, v2)
    normal = normal / (np.linalg.norm(normal) + 1e-9)

    ok_pitch = abs(normal[1]) < thr_ny

    kn_z = (xyz[5][2] + xyz[9][2] + xyz[13][2] + xyz[17][2]) / 4.0
    ok_z = abs(xyz[0][2] - kn_z) < thr_z

    return ok_pitch and ok_z

def finger_curled(xyz, mcp, pip, dip, tip):
    """
    Палец считаем согнутым, если:
    1) углы в PIP и DIP меньше порога (палец не "прямой"),
    2) tip близко к MCP (кулак/сжатие).
    """
    ang_pip = angle_3d(xyz[mcp], xyz[pip], xyz[dip])
    ang_dip = angle_3d(xyz[pip], xyz[dip], xyz[tip])
    close_tip = ndist(xyz, tip, mcp) < TIP_TO_MCP_CURLED_THR

    return (ang_pip < PIP_DIP_CURLED_THR) and (ang_dip < PIP_DIP_CURLED_THR) and close_tip, ang_pip, ang_dip, ndist(xyz, tip, mcp)

def thumb_flexed_and_tucked(xyz):
    """
    Для твоего случая "А": большой палец Согнут, tip(4) близко к кулаку.
    Учитываем, что точки 3 и 4 могут быть очень близко (tip согнут).
    """
    # угол в IP сустава большого: 2-3-4
    ang_ip = angle_3d(xyz[2], xyz[3], xyz[4])

    # tip большого должен быть "рядом с кулаком" — около index_mcp(5) или middle_mcp(9)
    d_to_index_mcp = ndist(xyz, 4, 5)
    d_to_middle_mcp = ndist(xyz, 4, 9)
    tucked = min(d_to_index_mcp, d_to_middle_mcp) < THUMB_TUCK_TOUCH_THR

    flexed = ang_ip < THUMB_IP_FLEX_THR
    return (flexed and tucked), ang_ip, min(d_to_index_mcp, d_to_middle_mcp)

def is_letter_A(hand_landmarks):
    """
    Буква "А" (по твоему описанию):
    - четыре пальца (index/middle/ring/pinky) согнуты в кулак
    - большой палец согнут и "прижат" к кулаку (tip близко к MCP указательного/среднего)
    """
    xyz = lms_to_xyz(hand_landmarks)

    idx_ok, idx_pip, idx_dip, idx_tipmcp = finger_curled(xyz, 5, 6, 7, 8)
    mid_ok, mid_pip, mid_dip, mid_tipmcp = finger_curled(xyz, 9, 10, 11, 12)
    ring_ok, ring_pip, ring_dip, ring_tipmcp = finger_curled(xyz, 13, 14, 15, 16)
    pink_ok, pink_pip, pink_dip, pink_tipmcp = finger_curled(xyz, 17, 18, 19, 20)

    thumb_ok, thumb_ip, thumb_touch = thumb_flexed_and_tucked(xyz)

    if not thumb_ok:
        return False

    # Доп. стабилизация: tips (8,12,16,20) не должны быть "слишком далеко" от запястья (0)
    fist_compact = (
        ndist(xyz, 8, 0) < FIST_COMPACT_THR and
        ndist(xyz, 12, 0) < FIST_COMPACT_THR and
        ndist(xyz, 16, 0) < FIST_COMPACT_THR and
        ndist(xyz, 20, 0) < FIST_COMPACT_THR
    )

    if not (idx_ok and mid_ok and ring_ok and pink_ok):
        return False

    ok = idx_ok and mid_ok and ring_ok and pink_ok and thumb_ok and fist_compact

    if not (
        ndist(xyz, 8, 5)   < 0.75 and  # NEW
        ndist(xyz, 12, 9)  < 0.75 and  # NEW
        ndist(xyz, 16, 13) < 0.75 and  # NEW
        ndist(xyz, 20, 17) < 0.75      # NEW
    ):
        return False
    
    knuckles_y = (xyz[5][1] + xyz[9][1] + xyz[13][1] + xyz[17][1]) / 4.0
    hand_up = (knuckles_y + 0.01) < xyz[0][1]   # NEW: +0.02 — допуск/запас от дрожания
    if not hand_up:
        return False
    
    return ok

def is_letter_B(hand_landmarks):
    """
    Буква "Б" (по твоему описанию):
    - указательный прямой
    - средний согнут и прижат к указательному
    - безымянный и мизинец согнуты дугой
    - кончик большого касается (примерно) кончиков/области безымянного и мизинца (16 и 20)
    - кисть поднята вверх (примерно: tip указательного выше запястья)
    """
    xyz = lms_to_xyz(hand_landmarks)

    # 1) Указательный прямой
    index_ext = finger_extended(xyz, 5, 6, 7, 8, thr=170)

    # 2) Средний НЕ прямой + прижат к указательному
    middle_ext = finger_extended(xyz, 9, 10, 11, 12, thr=170)
    middle_not_ext = not middle_ext

    # "прижат": tip среднего (12) близко к суставам указательного (6 или 7)
    d12_6 = ndist(xyz, 12, 6)
    d12_7 = ndist(xyz, 12, 7)
    middle_touch_index = min(d12_6, d12_7) < 0.65  # подгонка

    # 3) Безымянный и мизинец согнуты
    ring_curled,  ring_pip,  ring_dip,  ring_tipmcp  = finger_curled(xyz, 13, 14, 15, 16)
    pinky_curled, pink_pip,  pink_dip,  pink_tipmcp  = finger_curled(xyz, 17, 18, 19, 20)

    # 4) Большой касается области 16 и 20 (кончики/дуга)
    d4_16 = ndist(xyz, 4, 16)
    d4_20 = ndist(xyz, 4, 20)
    thumb_touch = (d4_16 < 0.6) or (d4_20 < 0.65)  # подгонка: +-0.1

    # 5) "Кисть вверх" (очень мягко)
    hand_up = (xyz[8][1] + 0.02) < xyz[0][1]

    ok = (
        index_ext and
        middle_not_ext and middle_touch_index and
        ring_curled and pinky_curled and
        thumb_touch and
        hand_up
    )

    return ok

def is_letter_V(hand_landmarks):
    xyz = lms_to_xyz(hand_landmarks)

    # 1. Все 4 пальца прямые
    idx_ext   = finger_extended(xyz, 5, 6, 7, 8,  thr=170)
    mid_ext   = finger_extended(xyz, 9,10,11,12, thr=170)
    ring_ext  = finger_extended(xyz,13,14,15,16, thr=170)
    pink_ext  = finger_extended(xyz,17,18,19,20, thr=170)

    fingers_straight = idx_ext and mid_ext and ring_ext and pink_ext

    # 2. Большой палец не торчит (не "Г")
    # tip(4) не далеко от ладони (0)
    thumb_not_out = ndist(xyz, 4, 0) < 1.2

    # 3. Ладонь "боком": пальцы примерно в одной Z-плоскости
    z_vals = [xyz[i][2] for i in (8, 12, 16, 20)]
    z_spread = max(z_vals) - min(z_vals)
    palm_sideways = z_spread < 0.10   # подстройка: 0.08–0.15
    sideways = palm_is_sideways(xyz)

    return fingers_straight and thumb_not_out and palm_sideways and sideways

def is_letter_G(hand_landmarks):
    xyz = lms_to_xyz(hand_landmarks)

    # 1. Указательный прямой
    index_ext = finger_extended(xyz, 5, 6, 7, 8, thr=155)

    # 2. Большой палец прямой
    thumb_ext = finger_extended(xyz, 1, 2, 3, 4, thr=145)

    # 3. Остальные пальцы согнуты
    middle_ok = not finger_extended(xyz, 9, 10, 11, 12, thr=160)
    ring_ok   = not finger_extended(xyz,13,14,15,16, thr=160)
    pinky_ok  = not finger_extended(xyz,17,18,19,20, thr=160)

    # 4. Угол между большим и указательным (НАСТОЯЩИЙ)
    v_thumb = np.array(xyz[4]) - np.array(xyz[2])   # большой
    v_index = np.array(xyz[8]) - np.array(xyz[5])   # указательный

    angle_thumb_index = angle_between(v_thumb, v_index)
    right_angle = 60 < angle_thumb_index < 150

    # 5. Рука "указывает вниз"
    # направление указательного пальца
    v_index = np.array(xyz[8]) - np.array(xyz[5])

    # Y растёт вниз → значит палец направлен вниз
    hand_down = v_index[1] > 0.25 * abs(v_index[0])

    return (
        index_ext and
        thumb_ext and
        middle_ok and ring_ok and pinky_ok and
        right_angle and
        hand_down
    )

def is_D_pose(xyz):
    """
    Статическая форма буквы Д:
    - указательный и средний прямые
    - они рядом
    - остальные пальцы не прямые
    """
    idx_ext = finger_extended(xyz, 5, 6, 7, 8, thr=160)
    mid_ext = finger_extended(xyz, 9,10,11,12, thr=160)

    # указательный и средний вместе
    fingers_together = ndist(xyz, 8, 12) < 0.35

    ring_not_ext  = not finger_extended(xyz,13,14,15,16, thr=160)
    pinky_not_ext = not finger_extended(xyz,17,18,19,20, thr=160)

    return (
        idx_ext and
        mid_ext and
        fingers_together and
        ring_not_ext and
        pinky_not_ext
    )

def update_D_traj(d_traj, xyz, track_point=9):
    """
    Добавляет точку в траекторию Д.
    track_point = 9 (MCP среднего пальца) — стабильно.
    """
    x, y = xyz[track_point][0], xyz[track_point][1]
    d_traj.append((x, y))

def is_letter_D(d_traj, min_points=40):
    """
    Проверяет, что траектория описывает >= 2 оборотов.
    """
    if len(d_traj) < min_points:
        return False

    # центр траектории
    cx = sum(p[0] for p in d_traj) / len(d_traj)
    cy = sum(p[1] for p in d_traj) / len(d_traj)

    angles = []
    for x, y in d_traj:
        angles.append(math.atan2(y - cy, x - cx))

    total_angle = 0.0
    for i in range(1, len(angles)):
        da = angles[i] - angles[i - 1]
        if da > math.pi:
            da -= 2 * math.pi
        elif da < -math.pi:
            da += 2 * math.pi
        total_angle += da

    rotations = abs(total_angle) / (2 * math.pi)

    return rotations >= 1.8

def is_letter_E(hand_landmarks):
    """
    Буква "Е":
    - все пальцы согнуты
    - кончики пальцев образуют "туннель" (близко друг к другу)
    - ладонь поднята вверх
    """
    xyz = lms_to_xyz(hand_landmarks)

    # 1. Все пальцы (кроме большого) согнуты
    idx_ok, _, _, _   = finger_curled(xyz, 5, 6, 7, 8)
    mid_ok, _, _, _   = finger_curled(xyz, 9, 10, 11, 12)
    ring_ok, _, _, _  = finger_curled(xyz, 13, 14, 15, 16)
    pink_ok, _, _, _  = finger_curled(xyz, 17, 18, 19, 20)

    fingers_curled = idx_ok and mid_ok and ring_ok and pink_ok

    # 2. Большой палец согнут и "внутри"
    thumb_ok, _, _ = thumb_flexed_and_tucked(xyz)

    # 3. "Туннель": кончики пальцев близко друг к другу
    # Проверяем компактность дуги
    tunnel = (
        ndist(xyz, 8, 12) < 0.55 and
        ndist(xyz, 12, 16) < 0.55 and
        ndist(xyz, 16, 20) < 0.55
    )

    # 4. Рука поднята вверх:
    # средняя точка пальцев выше запястья
    avg_finger_y = (xyz[8][1] + xyz[12][1] + xyz[16][1] + xyz[20][1]) / 4
    hand_up = avg_finger_y + 0.02 < xyz[0][1]

    return fingers_curled and thumb_ok and tunnel and hand_up

def is_YO_pose(xyz):
    """
    Статическая форма для "Ё" = "туннель" ладонью:
    - 4 пальца согнуты
    - большой согнут/поджат
    - кончики пальцев близко друг к другу (компактная "дуга/туннель")
    """
    # 4 пальца согнуты
    idx_ok, _, _, _   = finger_curled(xyz, 5, 6, 7, 8)
    mid_ok, _, _, _   = finger_curled(xyz, 9, 10, 11, 12)
    ring_ok, _, _, _  = finger_curled(xyz, 13, 14, 15, 16)
    pink_ok, _, _, _  = finger_curled(xyz, 17, 18, 19, 20)
    if not (idx_ok and mid_ok and ring_ok and pink_ok):
        return False

    # большой палец поджат
    thumb_ok, _, _ = thumb_flexed_and_tucked(xyz)
    if not thumb_ok:
        return False

    # "туннель": кончики близко друг к другу
    tunnel = (
        ndist(xyz, 8, 12)  < 0.60 and
        ndist(xyz, 12, 16) < 0.60 and
        ndist(xyz, 16, 20) < 0.60 and
        ndist(xyz, 8, 20)  < 0.95
    )

    return tunnel

def update_YO_traj(yo_traj, xyz):
    """
    Сохраняем угол "поворота кисти" в кадре.
    Берём линию поперёк ладони: index_mcp(5) -> pinky_mcp(17).
    При вращении кисти (roll) эта линия заметно вращается.
    """
    x1, y1 = xyz[5][0], xyz[5][1]
    x2, y2 = xyz[17][0], xyz[17][1]
    ang = math.atan2((y2 - y1), (x2 - x1))  # [-pi..pi]
    yo_traj.append(ang)

def is_letter_YO(yo_traj, min_points=28, min_total_turn_rad=math.pi * 1.2):
    """
    Динамика для "Ё": пока держим "туннель", суммарная "закрутка" угла
    должна превысить порог (по умолчанию ~189°).

    min_total_turn_rad:
      - 0.8*pi  (~144°)  легче распознаётся, но больше ложных
      - 1.0*pi  (~180°)  норм
      - 1.2*pi  (~216°)  строже
    """
    if len(yo_traj) < min_points:
        return False

    total = 0.0
    for i in range(1, len(yo_traj)):
        da = yo_traj[i] - yo_traj[i - 1]
        # unwrap
        if da > math.pi:
            da -= 2 * math.pi
        elif da < -math.pi:
            da += 2 * math.pi
        total += abs(da)

    return total >= min_total_turn_rad

def is_letter_ZH(hand_landmarks):
    """
    Буква "Ж" (как на фото): "пучок/клюв"
    - 4 пальца вытянуты (или почти)
    - кончики 8,12,16,20 сильно сведены (пучок)
    - большой 4 подтянут к этому пучку (треугольник)
    - кисть НЕ согнута (wrist_not_bent)
    - (0 -> 17) почти строго вдоль оси Y (вертикально вверх)
    """
    xyz = lms_to_xyz(hand_landmarks)

    # NEW: вектор (0->17) строго по Y (вертикаль), и "вверх"
    if not vec_0_17_along_y(xyz, max_angle_deg=12, enforce_up=True, min_len_nd=0.30):
        return False

    # NEW: кисть не заломана в запястье
    if not wrist_not_bent(xyz, thr_z=0.07, thr_ny=0.60):
        return False

    # 1) 4 пальца вытянуты (допускаем небольшой изгиб)
    idx_ext  = finger_extended(xyz, 5, 6, 7, 8,  thr=155)
    mid_ext  = finger_extended(xyz, 9,10,11,12, thr=155)
    ring_ext = finger_extended(xyz,13,14,15,16, thr=155)
    pink_ext = finger_extended(xyz,17,18,19,20, thr=155)
    if not (idx_ext and mid_ext and ring_ext and pink_ext):
        return False

    # 2) Пучок кончиков (как на фото — очень плотный)
    tips_together = (
        ndist(xyz, 8, 12)  < 0.34 and
        ndist(xyz, 12, 16) < 0.34 and
        ndist(xyz, 16, 20) < 0.34 and
        ndist(xyz, 8, 20)  < 0.55
    )
    if not tips_together:
        return False

    # 3) Большой подтянут к пучку (создаёт "клюв/треугольник")
    thumb_near_cluster = min(
        ndist(xyz, 4, 8),
        ndist(xyz, 4, 12),
        ndist(xyz, 4, 16),
        ndist(xyz, 4, 20),
    ) < 0.55
    if not thumb_near_cluster:
        return False

    # 4) Стабилизация: пучок реально "сжат" относительно ширины ладони
    tip_spread = (ndist(xyz, 8, 12) + ndist(xyz, 12, 16) + ndist(xyz, 16, 20)) / 3.0
    mcp_spread = (ndist(xyz, 5, 9) + ndist(xyz, 9, 13) + ndist(xyz, 13, 17)) / 3.0
    if not (tip_spread < 0.65 * mcp_spread):
        return False

    # 5) (опционально, но на фото обычно так) ладонь чуть боком
    # если начнёт мешать при фронтальной постановке — убери эту строку
    if not palm_is_sideways(xyz):
        return False

    return True

def is_Z_pose(xyz):
    # указательный прямой, остальные согнуты
    index_ext = finger_extended(xyz, 5, 6, 7, 8, thr=165)
    mid_curled,  _, _, _ = finger_curled(xyz, 9, 10, 11, 12)
    ring_curled, _, _, _ = finger_curled(xyz, 13, 14, 15, 16)
    pink_curled, _, _, _ = finger_curled(xyz, 17, 18, 19, 20)
    thumb_not_out = ndist(xyz, 4, 0) < 1.20
    return index_ext and mid_curled and ring_curled and pink_curled and thumb_not_out

def update_Z_traj(z_traj, xyz, track_point=8):
    z_traj.append((xyz[track_point][0], xyz[track_point][1]))

def _resample_by_arclen(pts, n=72):
    """Ресемплинг траектории по длине дуги (устойчиво к скорости рисования)."""
    if len(pts) < 2:
        return pts

    # длины сегментов
    seg = []
    total = 0.0
    for i in range(1, len(pts)):
        x1, y1 = pts[i-1]
        x2, y2 = pts[i]
        d = math.hypot(x2-x1, y2-y1)
        seg.append(d)
        total += d

    if total < 1e-9:
        return [pts[0]] * n

    step = total / (n - 1)
    out = [pts[0]]
    dist_acc = 0.0
    i = 1
    cur = pts[0]

    target = step
    while len(out) < n and i < len(pts):
        prev = pts[i-1]
        nxt = pts[i]
        d = math.hypot(nxt[0]-prev[0], nxt[1]-prev[1])

        if d < 1e-9:
            i += 1
            continue

        while dist_acc + d >= target and len(out) < n:
            t = (target - dist_acc) / d
            x = prev[0] + t * (nxt[0] - prev[0])
            y = prev[1] + t * (nxt[1] - prev[1])
            out.append((x, y))
            target += step

        dist_acc += d
        i += 1

    # добиваем последней точкой
    while len(out) < n:
        out.append(pts[-1])

    return out

def _smooth3(pts):
    """Простое сглаживание (скользящее среднее 3)."""
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts)-1):
        x = (pts[i-1][0] + pts[i][0] + pts[i+1][0]) / 3.0
        y = (pts[i-1][1] + pts[i][1] + pts[i+1][1]) / 3.0
        out.append((x, y))
    out.append(pts[-1])
    return out

def is_letter_Z(z_traj, min_points=30):
    """
    Русская "З" (силуэт как '3'):
    - рисование сверху вниз (y_end > y_start)
    - 2 выраженных пика по X (две правые выпуклости)
    - между ними выраженная впадина по X
    - без резких углов (не латинская Z)
    """
    if len(z_traj) < min_points:
        return False

    pts = list(z_traj)

    # 1) нормализация по bbox (чтобы не зависеть от амплитуды)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    w = (maxx - minx) + 1e-9
    h = (maxy - miny) + 1e-9
    s = max(w, h)

    # минимальный “размах” движения
    if (w / s) < 0.30 or (h / s) < 0.30:
        return False

    npts = [((x - minx) / s, (y - miny) / s) for x, y in pts]

    # 2) ресемплинг + сглаживание
    npts = _resample_by_arclen(npts, n=72)
    npts = _smooth3(npts)

    xs = [p[0] for p in npts]
    ys = [p[1] for p in npts]

    # 3) движение сверху вниз (в кадре Y растёт вниз)
    if not (ys[-1] - ys[0] > 0.35):
        return False

    # 4) локальные максимумы/минимумы по X
    max_idx = []
    min_idx = []
    for i in range(1, len(xs)-1):
        if xs[i-1] < xs[i] > xs[i+1]:
            max_idx.append(i)
        if xs[i-1] > xs[i] < xs[i+1]:
            min_idx.append(i)

    if len(max_idx) < 2 or len(min_idx) < 1:
        return False

    # 5) выбираем 2 сильных “пика вправо”
    # пик должен быть заметно правее среднего
    meanx = sum(xs) / len(xs)
    strong_peaks = [i for i in max_idx if xs[i] > meanx + 0.10]
    if len(strong_peaks) < 2:
        return False

    # берём два самых правых пика, но разнесённых по времени
    strong_peaks.sort(key=lambda i: xs[i], reverse=True)
    p1 = strong_peaks[0]
    p2 = None
    for i in strong_peaks[1:]:
        if abs(i - p1) >= 12:  # разнос по траектории
            p2 = i
            break
    if p2 is None:
        return False

    # упорядочим по времени
    if p2 < p1:
        p1, p2 = p2, p1

    # 6) должна быть “впадина” между пиками (серединка "3")
    between_mins = [i for i in min_idx if p1 < i < p2]
    if not between_mins:
        return False
    valley_i = min(between_mins, key=lambda i: xs[i])

    # впадина должна быть существенно левее пиков
    peak_x = min(xs[p1], xs[p2])
    if not (peak_x - xs[valley_i] > 0.14):
        return False

    # 7) анти-латинская Z: не должно быть 2 резких углов (~ломаная из 3 сегментов)
    # считаем “скачки” направления
    angles = []
    for i in range(1, len(npts)):
        dx = npts[i][0] - npts[i-1][0]
        dy = npts[i][1] - npts[i-1][1]
        if math.hypot(dx, dy) < 1e-6:
            continue
        angles.append(math.degrees(math.atan2(dy, dx)))

    # unwrap + считаем резкие скачки
    sharp = 0
    for i in range(1, len(angles)):
        da = angles[i] - angles[i-1]
        while da > 180:
            da -= 360
        while da < -180:
            da += 360
        if abs(da) > 85:  # резкий “угол”
            sharp += 1

    # для "З" обычно максимум 0–2, для латинской Z часто 2+ стабильно
    if sharp >= 3:
        return False

    return True

def get_fingers_state(xyz):
    """
    Возвращает [thumb, index, middle, ring, pinky] или None,
    если xyz отсутствует/неполный.
    """
    if xyz is None or len(xyz) < 21:
        return None

    # Большой палец
    thumb_ext = finger_extended(xyz, 1, 2, 3, 4, thr=150)
    thumb_out = (ndist(xyz, 4, 0) > 0.85) and (ndist(xyz, 4, 5) > 0.45)
    thumb = thumb_ext and thumb_out

    # Остальные
    index  = finger_extended(xyz, 5, 6, 7, 8,  thr=165)
    middle = finger_extended(xyz, 9, 10, 11, 12, thr=165)
    ring   = finger_extended(xyz, 13, 14, 15, 16, thr=165)
    pinky  = finger_extended(xyz, 17, 18, 19, 20, thr=165)

    return [thumb, index, middle, ring, pinky]


def is_letter_1(fingers):
    # только указательный
    return fingers == [False, True,  False, False, False]

def is_letter_2(fingers):
    # указательный + средний
    return fingers == [False, True,  True,  False, False]

def is_letter_3(fingers):
    # указательный + средний + безымянный
    return fingers == [False, True,  True,  True,  False]

def is_letter_4(fingers):
    # четыре пальца без большого
    return fingers == [False, True,  True,  True,  True]

def is_letter_5(fingers):
    # все пять
    return fingers == [True,  True,  True,  True,  True]

def detect_digit_1_5(fingers):
    if not fingers:   # None или пусто
        return None
    if is_letter_5(fingers): return "5"
    if is_letter_4(fingers): return "4"
    if is_letter_3(fingers): return "3"
    if is_letter_2(fingers): return "2"
    if is_letter_1(fingers): return "1"
    return None

# =========================
# ЦИФРА 6 (ДВУМЯ РУКАМИ)
# =========================

PALM_FACE_RATIO = 1.15     # насколько "сильнее" Z-нормаль должна быть X (ладонь в камеру)
PALM_TOUCH_THR  = 0.55     # порог касания: dist(thumb_tip -> palm_area) / palm_scale(palm) < thr

def palm_facing_camera(xyz, ratio=PALM_FACE_RATIO):
    """
    True, если ладонь в камеру (внутренняя часть ладони видна).
    Используем нормаль плоскости ладони: если |nz| доминирует над |nx| -> ладонь фронтально.
    """
    p0  = np.array(xyz[0])   # wrist
    p5  = np.array(xyz[5])   # index MCP
    p17 = np.array(xyz[17])  # pinky MCP
    normal = np.cross(p5 - p0, p17 - p0)

    nx, ny, nz = abs(normal[0]), abs(normal[1]), abs(normal[2])
    return nz > nx * ratio

def is_open_palm(xyz):
    """
    Открытая ладонь: все пальцы выпрямлены (как "5"),
    + небольшая проверка "раскрытости" (чтобы не путать с плотными 'пучками').
    """
    thumb = finger_extended(xyz, 1, 2, 3, 4,  thr=150) and (ndist(xyz, 4, 0) > 0.75)
    idx   = finger_extended(xyz, 5, 6, 7, 8,  thr=165)
    mid   = finger_extended(xyz, 9,10,11,12, thr=165)
    ring  = finger_extended(xyz,13,14,15,16, thr=165)
    pink  = finger_extended(xyz,17,18,19,20, thr=165)

    # "раскрытость" — расстояние между кончиками указательного и мизинца
    spread_ok = ndist(xyz, 8, 20) > 0.85

    return thumb and idx and mid and ring and pink and spread_ok

def thumb_touches_palm(xyz_thumb_hand, xyz_palm_hand, thr=PALM_TOUCH_THR):
    """
    Проверяем, что tip большого (4) второй руки касается области ладони первой руки.
    Нормализуем расстояние по palm_scale(palm_hand), чтобы не зависеть от масштаба.
    """
    tip = xyz_thumb_hand[4]

    # точки "области ладони": запястье и основания пальцев + центр (9)
    palm_targets = [xyz_palm_hand[i] for i in (0, 5, 9, 13, 17)]
    scale = palm_scale(xyz_palm_hand)

    dmin = min(dist_3d(tip, t) for t in palm_targets) / (scale + 1e-9)

    # чтобы не ловить случайные касания кулаком — большой палец на "жестовой" руке должен быть выпрямлен
    thumb_ext = finger_extended(xyz_thumb_hand, 1, 2, 3, 4, thr=150)

    # остальные пальцы на "жестовой" руке обычно не обязаны быть прямыми — но ограничим их количество
    others_ext = sum([
        finger_extended(xyz_thumb_hand, 5, 6, 7, 8,  thr=165),
        finger_extended(xyz_thumb_hand, 9,10,11,12, thr=165),
        finger_extended(xyz_thumb_hand,13,14,15,16, thr=165),
        finger_extended(xyz_thumb_hand,17,18,19,20, thr=165),
    ])

    return (dmin < thr) and thumb_ext and (others_ext <= 2)

def is_letter_6(hand_landmarks_a, hand_landmarks_b):
    """
    "6": одна рука — открытая ладонь (в камеру), другая — большой палец касается ладони.
    Работает без handedness: проверяем обе перестановки (A ладонь / B большой) и наоборот.
    """
    xyz_a = lms_to_xyz(hand_landmarks_a)
    xyz_b = lms_to_xyz(hand_landmarks_b)

    # Вариант 1: A = ладонь, B = большой палец
    if is_open_palm(xyz_a) and palm_facing_camera(xyz_a) and thumb_touches_palm(xyz_b, xyz_a):
        return True

    # Вариант 2: B = ладонь, A = большой палец
    if is_open_palm(xyz_b) and palm_facing_camera(xyz_b) and thumb_touches_palm(xyz_a, xyz_b):
        return True

    return False

FINGERS_TOUCH_THR = 0.55  # ADDED: порог касания пальцев к ладони (подстройка 0.45–0.70)
PALM_TARGET_IDS   = (0, 5, 9, 13, 17) 

_TIP2FINGER = {  
    4:  (1, 2, 3, 4),        # thumb
    8:  (5, 6, 7, 8),        # index
    12: (9, 10, 11, 12),     # middle
    16: (13, 14, 15, 16),    # ring
    20: (17, 18, 19, 20),    # pinky
}

def _min_tip_to_palm_norm(xyz_touch, tip_id, xyz_palm):  
    """min dist(tip -> palm_targets) / palm_scale"""
    tip = xyz_touch[tip_id]
    scale = palm_scale(xyz_palm) + 1e-9
    dmin = min(dist_3d(tip, xyz_palm[k]) for k in PALM_TARGET_IDS)
    return dmin / scale

def fingertips_touch_palm(xyz_touch, xyz_palm, tips,
                          thr=FINGERS_TOUCH_THR,
                          require_extended=True,
                          forbid_thumb_touch=True): 
    """
    True, если ВСЕ указанные tips касаются области ладони.
    require_extended: касающиеся пальцы должны быть выпрямлены (стабилизация)
    forbid_thumb_touch: большой палец НЕ должен касаться ладони (чтобы не путать с "6")
    """
    # 1) касание всеми нужными кончиками
    for tip_id in tips:
        if _min_tip_to_palm_norm(xyz_touch, tip_id, xyz_palm) >= thr:
            return False

    # 2) касающиеся пальцы (обычно) прямые
    if require_extended:
        for tip_id in tips:
            a, b, c, d = _TIP2FINGER[tip_id]
            if not finger_extended(xyz_touch, a, b, c, d, thr=150):
                return False

    # 3) исключаем "6": большой палец НЕ касается ладони
    if forbid_thumb_touch:
        if _min_tip_to_palm_norm(xyz_touch, 4, xyz_palm) < thr:
            return False

    return True

def is_letter_7(hand_landmarks_a, hand_landmarks_b): 
    """7: Приложить к внутренней стороне ладони два пальца (указательный+средний)."""
    xyz_a = lms_to_xyz(hand_landmarks_a)
    xyz_b = lms_to_xyz(hand_landmarks_b)

    if is_open_palm(xyz_a) and palm_facing_camera(xyz_a) and \
       fingertips_touch_palm(xyz_b, xyz_a, tips=(8, 12)):
        return True

    if is_open_palm(xyz_b) and palm_facing_camera(xyz_b) and \
       fingertips_touch_palm(xyz_a, xyz_b, tips=(8, 12)):
        return True

    return False

def is_letter_8(hand_landmarks_a, hand_landmarks_b):  
    """8: Приложить к внутренней стороне ладони три пальца другой руки (большой+указательный+средний)."""
    xyz_a = lms_to_xyz(hand_landmarks_a)
    xyz_b = lms_to_xyz(hand_landmarks_b)

    # A = ладонь, B = пальцы (4, 8, 12)
    if is_open_palm(xyz_a) and palm_facing_camera(xyz_a) and \
       fingertips_touch_palm(xyz_b, xyz_a, tips=(4, 8, 12), forbid_thumb_touch=False):  
        return True

    # B = ладонь, A = пальцы (4, 8, 12)
    if is_open_palm(xyz_b) and palm_facing_camera(xyz_b) and \
       fingertips_touch_palm(xyz_a, xyz_b, tips=(4, 8, 12), forbid_thumb_touch=False):  
        return True

    return False

def is_letter_9(hand_landmarks_a, hand_landmarks_b):  
    """9: Приложить к внутренней стороне ладони четыре пальца (указательный+средний+безымянный+мизинец)."""
    xyz_a = lms_to_xyz(hand_landmarks_a)
    xyz_b = lms_to_xyz(hand_landmarks_b)

    if is_open_palm(xyz_a) and palm_facing_camera(xyz_a) and \
       fingertips_touch_palm(xyz_b, xyz_a, tips=(8, 12, 16, 20)):
        return True

    if is_open_palm(xyz_b) and palm_facing_camera(xyz_b) and \
       fingertips_touch_palm(xyz_a, xyz_b, tips=(8, 12, 16, 20)):
        return True

    return False

def is_0_pose(
    xyz,
    touch_thr=0.33,            # 4-8 близко (кольцо)
    idx_pip_max=150,           # чем меньше — тем сильнее сгиб в PIP
    idx_dip_max=165,           # сгиб в DIP
    idx_tip_mcp_max=1.10,      # tip(8) ближе к mcp(5) => палец реально скруглён
    th_ip_max=165,             # сгиб в IP большого
    th_tip_mcp_max=1.05,       # tip(4) ближе к mcp(2) => большой скруглён
    mid_thr=150, ring_thr=145, pink_thr=140,  # прямые остальные
    together_thr=0.65,
    wide_thr=0.95
):
    # 1) Кольцо (ОК)
    if ndist(xyz, 4, 8) >= touch_thr:
        return False

    # 2) Указательный "строго скруглён": углы + tip ближе к основанию
    idx_pip = angle2d(xyz[5], xyz[6], xyz[7])   # угол в PIP (6)
    idx_dip = angle2d(xyz[6], xyz[7], xyz[8])   # угол в DIP (7)
    idx_round = (idx_pip < idx_pip_max) and (idx_dip < idx_dip_max) and (ndist(xyz, 8, 5) < idx_tip_mcp_max)
    if not idx_round:
        return False

    # 3) Большой "строго скруглён": угол в IP + tip ближе к основанию
    th_ip = angle2d(xyz[2], xyz[3], xyz[4])     # угол в IP (3)
    th_round = (th_ip < th_ip_max) and (ndist(xyz, 4, 2) < th_tip_mcp_max)
    if not th_round:
        return False

    # 4) Остальные пальцы выпрямлены
    mid_ext  = finger_extended(xyz,  9, 10, 11, 12, thr=mid_thr)
    ring_ext = finger_extended(xyz, 13, 14, 15, 16, thr=ring_thr)
    pink_ext = finger_extended(xyz, 17, 18, 19, 20, thr=pink_thr)
    if not (mid_ext and ring_ext and pink_ext):
        return False

    # 5) Чтобы не путать с "Кошка": пальцы "собраны", не растопырены
    together = (
        ndist(xyz, 12, 16) < together_thr and
        ndist(xyz, 16, 20) < together_thr and
        ndist(xyz, 12, 20) < wide_thr
    )
    return together

def is_letter_0(hand_lms):
    xyz = lms_to_xyz(hand_lms)
    return is_0_pose(xyz)

def is_CAT_pose(xyz):
    """
    КОШКА (1 рука): щепоть (4-8) + НЕ "0".
    Важно: используем ndist (нормировка по размеру ладони), чтобы не зависеть от масштаба.
    """

    # 1) щепоть: 4-8 должны быть заметно ближе, чем "типичные" расстояния рядом
    pinch = ndist(xyz, 4, 8)

    ref = min(
        ndist(xyz, 8, 12),  # index_tip -> middle_tip
        ndist(xyz, 4, 12),  # thumb_tip -> middle_tip
        ndist(xyz, 8, 5),   # index_tip -> index_mcp
        ndist(xyz, 4, 2),   # thumb_tip -> thumb_mcp-ish
    )

    if not (pinch < 0.55 * ref):
        return False

    # 2) анти-"0": если средний/безымянный/мизинец прямые — это скорее 0/ОК, а не кошка
    mid_ext  = finger_extended(xyz,  9, 10, 11, 12, thr=165)
    ring_ext = finger_extended(xyz, 13, 14, 15, 16, thr=165)
    pink_ext = finger_extended(xyz, 17, 18, 19, 20, thr=165)
    if mid_ext and ring_ext and pink_ext:
        return False

    return True


def update_CAT_traj(traj, xyz):
    """
    Трекаем центр щепоти + масштаб (wrist->middle_mcp) для нормировки движения.
    """
    x = 0.5 * (xyz[4][0] + xyz[8][0])
    y = 0.5 * (xyz[4][1] + xyz[8][1])
    s = _hand_scale2d(xyz)  # уже +1e-6 внутри
    traj.append((x, y, s))


def is_gesture_CAT(traj, min_points=6):
    """
    Динамика "усик": короткий горизонтальный штрих влево ИЛИ вправо,
    устойчивый по направлению и без сильных зигзагов.
    """
    n = len(traj)
    if n < min_points:
        return False

    pts = list(traj)

    # усредняем начало/конец для устойчивости
    k = max(2, min(5, n // 3))
    x0 = sum(p[0] for p in pts[:k]) / k
    y0 = sum(p[1] for p in pts[:k]) / k
    x1 = sum(p[0] for p in pts[-k:]) / k
    y1 = sum(p[1] for p in pts[-k:]) / k

    # медианный масштаб
    ss = sorted(p[2] for p in pts)
    s = ss[n // 2]

    dx = x1 - x0
    dy = y1 - y0
    if abs(dx) < 1e-6:
        return False

    dir_sign = 1 if dx > 0 else -1

    # размах по bbox
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x_range = (max(xs) - min(xs)) / s
    y_range = (max(ys) - min(ys)) / s

    # 1) движение должно быть заметным, но НЕ огромным (делаем мягче, чем было)
    moved_enough = (abs(dx) / s) > 0.22 or x_range > 0.28

    # 2) в основном горизонтально
    mostly_horizontal = (y_range < 0.60 * x_range + 0.02)

    # 3) направление по X должно быть устойчивым (а не дрожание туда-сюда)
    # считаем "сколько шага пошло в нужную сторону" / "весь модуль шага"
    pos, tot = 0.0, 0.0
    for (x_prev, _, _), (x_next, _, _) in zip(pts, pts[1:]):
        step = x_next - x_prev
        tot += abs(step)
        if step * dir_sign > 0:
            pos += abs(step)

    stable_dir = (pos / (tot + 1e-9)) > 0.62

    # 4) траектория не должна быть "сигналом-каракулями": чистый штрих
    path = 0.0
    for (x_prev, y_prev, _), (x_next, y_next, _) in zip(pts, pts[1:]):
        path += math.hypot(x_next - x_prev, y_next - y_prev)
    net = math.hypot(x1 - x0, y1 - y0)
    clean = (net / (path + 1e-9)) > 0.55

    return moved_enough and mostly_horizontal and stable_dir and clean

# Сглаживание и вывод
class LabelSmoother:
    """Храним последние метки и берём устойчивую (по большинству)."""
    def __init__(self, maxlen: int = HIST_LEN):
        self.hist = deque(maxlen=maxlen)

    def push(self, label_or_none: Optional[str]) -> None:
        self.hist.append(label_or_none)

    def stable_with_confidence(self) -> Tuple[Optional[str], float, int, int]:
        """
        Возвращает:
          (stable_label | None, confidence 0..1, votes, total_non_null)
        confidence = votes / total_non_null.
        """
        vals = [x for x in self.hist if x is not None]
        if not vals:
            return None, 0.0, 0, 0
        label, votes = Counter(vals).most_common(1)[0]
        total = len(vals)
        conf = float(votes) / float(total) if total else 0.0
        if votes < HIST_MIN_VOTES:
            return None, conf, votes, total
        return label, conf, votes, total


class GestureDetectorSession:
    """
    Сессия распознавания (stateful):
    - landmarker (MediaPipe Tasks)
    - траектории для Д/Ё/З
    - сглаживание результатов
    """
    def __init__(
        self,
        model_path: Optional[str] = None,
        num_hands: int = 2,
        min_hand_detection_confidence: float = 0.5,
        min_hand_presence_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ):
        self.model_path = self._resolve_model_path(model_path)
        self.num_hands = num_hands
        self.cat_traj = deque(maxlen=35)
        self.cat_cooldown_until = 0  # ms
        self.cat_miss = 0
        self.CAT_BLOCK_0_MINPTS = 3 

        BaseOptions = mp.tasks.BaseOptions
        HandLandmarker = mp.tasks.vision.HandLandmarker
        HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
        RunningMode = mp.tasks.vision.RunningMode

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(self.model_path)),
            running_mode=RunningMode.VIDEO,
            num_hands=num_hands,
            min_hand_detection_confidence=min_hand_detection_confidence,
            min_hand_presence_confidence=min_hand_presence_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )

        self._landmarker = HandLandmarker.create_from_options(options)

        # state для динамических букв
        self.d_traj = deque(maxlen=120)
        self.yo_traj = deque(maxlen=120)
        self.z_traj = deque(maxlen=220)
        cat_traj = deque(maxlen=35)
        cat_cooldown_until = 0  # ms
        cat_miss = 0

        self.smoother = LabelSmoother()

        self._last_ts_ms = 0

    def close(self) -> None:
        try:
            self._landmarker.close()
        except Exception:
            pass

    @staticmethod
    def _resolve_model_path(model_path: Optional[str]) -> Path:
        """
        Ищем hand_landmarker.task.
        Приоритет:
          1) явный аргумент model_path
          2) env GESTU_HAND_TASK_PATH
          3) repo root / hand_landmarker.task
          4) рядом с этим файлом
          5) текущая директория
        """
        if model_path:
            p = Path(model_path).expanduser().resolve()
            if not p.exists():
                raise FileNotFoundError(f"hand_landmarker.task не найден: {p}")
            return p

        envp = os.getenv("GESTU_HAND_TASK_PATH", "").strip()
        if envp:
            p = Path(envp).expanduser().resolve()
            if not p.exists():
                raise FileNotFoundError(f"GESTU_HAND_TASK_PATH указывает на несуществующий файл: {p}")
            return p

        here = Path(__file__).resolve()
        # .../app/backend/gesture/detector.py -> repo root = parents[3]
        candidates = [
            here.parents[3] / "hand_landmarker.task",
            here.parent / "hand_landmarker.task",
            Path.cwd() / "hand_landmarker.task",
        ]
        for c in candidates:
            if c.exists():
                return c.resolve()

        raise FileNotFoundError(
            "Не найден hand_landmarker.task.\n"
            "Положи его в корень репозитория или задай env GESTU_HAND_TASK_PATH."
        )

    def _ensure_ts(self, ts_ms: int) -> int:
        # MediaPipe требует монотонно возрастающий timestamp_ms.
        if ts_ms <= self._last_ts_ms:
            ts_ms = self._last_ts_ms + 1
        self._last_ts_ms = ts_ms
        return ts_ms

    def process_frame_bgr(self, frame_bgr: np.ndarray, ts_ms: Optional[int] = None) -> dict:
        """
        frame_bgr: np.ndarray (H,W,3), uint8
        ts_ms: timestamp в миллисекундах (монотонный). Если None — берём time.monotonic().
        Возвращает dict:
          {
            "raw": str|None,
            "stable": str|None,
            "confidence": float,
            "votes": int,
            "total": int
          }
        """
        if ts_ms is None:
            ts_ms = int(time.monotonic() * 1000)
        ts_ms = self._ensure_ts(int(ts_ms))

        # BGR -> RGB
        if frame_bgr is None or frame_bgr.ndim != 3 or frame_bgr.shape[2] != 3:
            return {"raw": None, "stable": None, "confidence": 0.0, "votes": 0, "total": 0}

        frame_rgb = frame_bgr[:, :, ::-1].copy()

        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        result = self._landmarker.detect_for_video(mp_image, ts_ms)

        raw = None
        xyz = None
        hand_lms = None

        if result.hand_landmarks:
            hands = list(result.hand_landmarks)

            # основная рука для "одноручных" жестов/динамики
            hand_lms = hands[0]
            xyz = lms_to_xyz(hand_lms)

            # --- 6-9 (ДВЕ РУКИ) ---
            # важно: порядок 9->8->7->6, потому что при 4 пальцах на ладони условие "7" тоже может быть истинным
            if len(hands) >= 2:
                h0, h1 = hands[0], hands[1]
                if is_letter_9(h0, h1):
                    raw = "9"
                elif is_letter_8(h0, h1):
                    raw = "8"
                elif is_letter_7(h0, h1):
                    raw = "7"
                elif is_letter_6(h0, h1):
                    raw = "6"
                else:
                    raw = None
            else:
                raw = None

            # если уже нашли 6-9 — дальше не даём коду перезаписать raw
            if raw is None:
                # --- КОШКА (1 рука) ---
                now_ms = ts_ms  # ВАЖНО: в этом методе timestamp = ts_ms

                # если в кадре не одна рука — кошку не копим
                if len(hands) != 1:
                    self.cat_traj.clear()
                    self.cat_miss = 0

                if now_ms >= self.cat_cooldown_until and len(hands) == 1:
                    if is_CAT_pose(xyz):
                        self.cat_miss = 0
                        update_CAT_traj(self.cat_traj, xyz)

                        if is_gesture_CAT(self.cat_traj):
                            raw = "КОШКА"
                            self.cat_traj.clear()
                            self.cat_miss = 0
                            self.cat_cooldown_until = now_ms + 600
                    else:
                        self.cat_miss += 1
                        if self.cat_miss >= 4:
                            self.cat_traj.clear()
                            self.cat_miss = 0

                # --- 0 (ТОЛЬКО ЕСЛИ КОШКА НЕ "В ПРОЦЕССЕ") ---
                cat_in_progress = (len(self.cat_traj) >= self.CAT_BLOCK_0_MINPTS)
                if raw is None and (not cat_in_progress) and is_letter_0(hand_lms):
                    raw = "0"

                # --- ДИНАМИЧЕСКАЯ "Д" ---
                if raw is None:
                    if is_D_pose(xyz):
                        update_D_traj(self.d_traj, xyz)
                        if is_letter_D(self.d_traj):
                            raw = "Д"
                    else:
                        self.d_traj.clear()

                # --- ДИНАМИЧЕСКАЯ "Ё" ---
                if raw is None:
                    if is_YO_pose(xyz):
                        update_YO_traj(self.yo_traj, xyz)
                        if is_letter_YO(self.yo_traj):
                            raw = "Ё"
                    else:
                        self.yo_traj.clear()

                # --- ДИНАМИЧЕСКАЯ "З" ---
                if raw is None:
                    if is_Z_pose(xyz):
                        update_Z_traj(self.z_traj, xyz, track_point=8)
                        if is_letter_Z(self.z_traj):
                            raw = "З"
                    else:
                        self.z_traj.clear()

                # --- СТАТИЧЕСКИЕ БУКВЫ ---
                if raw is None:
                    if is_letter_G(hand_lms):
                        raw = "Г"
                    elif is_letter_V(hand_lms):
                        raw = "В"
                    elif is_letter_B(hand_lms):
                        raw = "Б"
                    elif is_letter_A(hand_lms):
                        raw = "А"
                    elif is_letter_E(hand_lms):
                        raw = "Е"

                    # "Ж" приоритетнее
                    if is_letter_ZH(hand_lms):
                        raw = "Ж"

        else:
            raw = None
            xyz = None
            hand_lms = None
            self.d_traj.clear()
            self.yo_traj.clear()
            self.z_traj.clear()
            self.cat_traj.clear()
            self.cat_miss = 0   

        if raw is None and xyz is not None and hand_lms is not None:
            fingers = get_fingers_state(xyz)
            digit = detect_digit_1_5(fingers)

            if digit == "4" and palm_is_sideways(xyz) and is_letter_V(hand_lms):
                raw = "В"
            elif digit is not None:
                raw = digit
            
        self.smoother.push(raw)
        stable, conf, votes, total = self.smoother.stable_with_confidence()

        return {
            "raw": raw,
            "stable": stable,
            "confidence": float(conf),
            "votes": int(votes),
            "total": int(total),
        }

