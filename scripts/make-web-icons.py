# 生成网页（PWA）用的图标 → songs/icons/
#   python scripts/make-web-icons.py
# 公开的网页不用 SEGA 的角色图，用渐变底 + 白色「SBGA / TOOL」文字
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
TOP, BOTTOM = (236, 84, 150), (124, 92, 240)  # 粉 → 紫
FONT = r'C:\Windows\Fonts\segoeuib.ttf'


def gradient(size):
    g = Image.new('RGBA', (1, 2))
    g.putpixel((0, 0), TOP + (255,))
    g.putpixel((0, 1), BOTTOM + (255,))
    return g.resize((size, size), Image.BILINEAR)


def icon(size, content=0.8, radius=0.0):
    """content = 文字区域占边长的比例（maskable 图标要留安全区，用小一点）；radius = 圆角比例"""
    s = size * 4
    im = gradient(s)
    d = ImageDraw.Draw(im)
    area = s * content
    big = ImageFont.truetype(FONT, int(area * 0.36))
    small = ImageFont.truetype(FONT, int(area * 0.2))
    b1 = d.textbbox((0, 0), 'SBGA', font=big)
    b2 = d.textbbox((0, 0), 'TOOL', font=small)
    h1, h2, gap = b1[3] - b1[1], b2[3] - b2[1], area * 0.06
    top = s / 2 - (h1 + gap + h2) / 2
    d.text((s / 2 - (b1[2] - b1[0]) / 2 - b1[0], top - b1[1]), 'SBGA', font=big, fill='white')
    d.text((s / 2 - (b2[2] - b2[0]) / 2 - b2[0], top + h1 + gap - b2[1]), 'TOOL', font=small, fill='white')
    if radius:
        mask = Image.new('L', (s, s), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, s - 1, s - 1), radius=s * radius, fill=255)
        im.putalpha(mask)
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, content=0.6).save(os.path.join(OUT, 'icon-maskable-512.png'))  # 安卓会裁成圆形等，文字留在中间
icon(180).save(os.path.join(OUT, 'apple-touch-icon.png'))  # iOS 主屏幕（系统自己加圆角）
icon(64, radius=0.2).save(os.path.join(OUT, 'favicon.png'))
print('ok')
