from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "extension" / "icons"
SIZES = (16, 32, 48, 128)
UPSCALE = 8

OUTLINE = "#78909c"
GLOW = "#2aa6b3"
PLAY = "#dff7fa"


def px(size: int, value: float) -> float:
    return size * UPSCALE * value


def draw_icon(size: int) -> Image.Image:
    canvas = size * UPSCALE
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    glow_layer = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)

    outer = [px(size, 0.06), px(size, 0.14), px(size, 0.94), px(size, 0.86)]
    radius = px(size, 0.14)
    border_width = max(UPSCALE, round(px(size, 0.065)))
    glow_width = border_width + max(UPSCALE, round(px(size, 0.045)))
    play_width = max(UPSCALE, round(px(size, 0.05)))

    glow_draw.rounded_rectangle(
        outer,
        radius=radius,
        outline=GLOW,
        width=glow_width,
    )
    glow_layer = glow_layer.filter(
        ImageFilter.GaussianBlur(radius=max(1, round(px(size, 0.045))))
    )
    image.alpha_composite(glow_layer)

    draw.rounded_rectangle(outer, radius=radius, outline=OUTLINE, width=border_width)
    draw.line(
        [
            (px(size, 0.43), px(size, 0.36)),
            (px(size, 0.43), px(size, 0.64)),
            (px(size, 0.63), px(size, 0.5)),
            (px(size, 0.43), px(size, 0.36)),
        ],
        fill=PLAY,
        width=play_width,
        joint="curve",
    )

    final = image.resize((size, size), Image.Resampling.LANCZOS)
    return final


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for size in SIZES:
        output_path = OUTPUT_DIR / f"icon{size}.png"
        draw_icon(size).save(output_path)
        print(output_path.relative_to(ROOT))


if __name__ == "__main__":
    main()
