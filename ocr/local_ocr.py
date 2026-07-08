import json
import sys


def main():
    if len(sys.argv) < 2:
        print("missing image path", file=sys.stderr)
        return 2

    # Placeholder for a local formula OCR engine.
    # Replace this function with Pix2Text, pix2tex, UniMERNet, or another local model.
    result = {
        "latex": r"\text{Local OCR is not configured yet.}",
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
