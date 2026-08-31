import sharp from 'sharp';

export type SkinToneOption = {
    type: number;
    hex: string;
};

export type SkinToneResult = {
    type: number;
    hex: string;
    detectedHex: string;
    detectedIta: number;
    distance: number;
    confidence: number;
    sampledPixels: number;
    band: string;
};

type RGB = {
    r: number;
    g: number;
    b: number;
};

type RGBWithSamples = RGB & {
    sampledPixels: number;
    band: string;
};

type Lab = {
    l: number;
    a: number;
    b: number;
};

type SkinPixel = RGB & {
    x: number;
    y: number;
    luminance: number;
    weight: number;
};

type LuminanceBand = {
    name: string;
    lower: number;
    upper: number;
};

export class SkinToneDetector {
    async getTone(tones: SkinToneOption[], imageUrl: string): Promise<SkinToneResult> {
        this.validateTones(tones);
        this.validateImageUrl(imageUrl);

        const imageBuffer = await this.downloadImage(imageUrl);
        const detectedColor = await this.extractSkinAverageColor(imageBuffer);
        const nearestTone = this.findNearestToneCalibrated(detectedColor, tones);
        const detectedIta = this.rgbToIta(detectedColor);

        return {
            type: nearestTone.tone.type,
            hex: nearestTone.tone.hex,
            detectedHex: this.rgbToHex(detectedColor),
            detectedIta: Number(detectedIta.toFixed(2)),
            distance: Number(nearestTone.distance.toFixed(2)),
            confidence: this.distanceToConfidence(nearestTone.distance),
            sampledPixels: detectedColor.sampledPixels,
            band: detectedColor.band,
        };
    }

    private validateImageUrl(url: string): void {
        if (!url || !url.trim()) {
            throw new Error('URL da imagem não informada.');
        }

        try {
            new URL(url);
        } catch {
            throw new Error(`URL da imagem inválida: "${url}"`);
        }
    }

    private async downloadImage(url: string): Promise<Buffer> {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            },
        });

        if (!response.ok) {
            throw new Error(`Erro ao baixar imagem: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        return Buffer.from(arrayBuffer);
    }

    private async extractSkinAverageColor(imageBuffer: Buffer): Promise<RGBWithSamples> {
        const { data, info } = await sharp(imageBuffer)
            .rotate()
            .resize({
                width: 420,
                height: 520,
                fit: 'inside',
                withoutEnlargement: true,
            })
            .flatten({
                background: {
                    r: 255,
                    g: 255,
                    b: 255,
                },
            })
            .removeAlpha()
            .toColorspace('srgb')
            .raw()
            .toBuffer({ resolveWithObject: true });

        const pixels = this.collectSkinPixels(data, info.width, info.height, info.channels);

        if (pixels.length >= 80) {
            return this.calculateRobustSkinAverage(pixels);
        }

        return this.extractFallbackAverageColor(data, info.width, info.height, info.channels);
    }

    private collectSkinPixels(
        data: Buffer,
        width: number,
        height: number,
        channels: number,
    ): SkinPixel[] {
        const pixels: SkinPixel[] = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const regionWeight = this.getFaceRegionWeight(x, y, width, height);

                if (regionWeight <= 0) {
                    continue;
                }

                const index = (y * width + x) * channels;

                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];

                if (!this.isLikelySkin(r, g, b)) {
                    continue;
                }

                pixels.push({
                    x,
                    y,
                    r,
                    g,
                    b,
                    luminance: this.getLuminance(r, g, b),
                    weight: regionWeight,
                });
            }
        }

        return pixels;
    }

    private getFaceRegionWeight(
        x: number,
        y: number,
        width: number,
        height: number,
    ): number {
        const nx = x / width;
        const ny = y / height;

        const forehead =
            nx >= 0.37 &&
            nx <= 0.63 &&
            ny >= 0.17 &&
            ny <= 0.32;

        const leftCheek =
            nx >= 0.23 &&
            nx <= 0.42 &&
            ny >= 0.35 &&
            ny <= 0.56;

        const rightCheek =
            nx >= 0.58 &&
            nx <= 0.77 &&
            ny >= 0.35 &&
            ny <= 0.56;

        const nose =
            nx >= 0.43 &&
            nx <= 0.57 &&
            ny >= 0.31 &&
            ny <= 0.53;

        const mouthAndBeardArea = ny >= 0.57;

        if (mouthAndBeardArea) {
            return 0;
        }

        if (leftCheek || rightCheek) {
            return 2.8;
        }

        if (nose) {
            return 1.7;
        }

        if (forehead) {
            return 1.1;
        }

        return 0;
    }

    private isLikelySkin(r: number, g: number, b: number): boolean {
        if (this.isAlmostWhite(r, g, b)) {
            return false;
        }

        if (this.isAlmostBlack(r, g, b)) {
            return false;
        }

        if (this.isAlmostGray(r, g, b)) {
            return false;
        }

        const hsv = this.rgbToHsv(r, g, b);
        const ycbcr = this.rgbToYCbCr(r, g, b);

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);

        const hasColorDifference = max - min >= 8;

        const hsvRule =
            (hsv.h <= 60 || hsv.h >= 340) &&
            hsv.s >= 0.07 &&
            hsv.s <= 0.84 &&
            hsv.v >= 0.10 &&
            hsv.v <= 0.99;

        const ycbcrRule =
            ycbcr.cb >= 68 &&
            ycbcr.cb <= 156 &&
            ycbcr.cr >= 116 &&
            ycbcr.cr <= 200;

        const rgbRule =
            r >= 24 &&
            g >= 18 &&
            b >= 12 &&
            r >= g * 0.64 &&
            r >= b * 1.01 &&
            g >= b * 0.64 &&
            hasColorDifference;

        return hsvRule && ycbcrRule && rgbRule;
    }

    private calculateRobustSkinAverage(pixels: SkinPixel[]): RGBWithSamples {
        const luminances = pixels
            .map(pixel => pixel.luminance)
            .sort((a, b) => a - b);

        const band = this.chooseLuminanceBand(luminances);

        const lowerLimit = this.quantile(luminances, band.lower);
        const upperLimit = this.quantile(luminances, band.upper);

        let selectedPixels = pixels.filter(pixel => {
            return pixel.luminance >= lowerLimit && pixel.luminance <= upperLimit;
        });

        if (selectedPixels.length < 40) {
            selectedPixels = pixels;
        }

        selectedPixels = this.removeColorOutliers(selectedPixels);

        if (selectedPixels.length < 40) {
            selectedPixels = pixels;
        }

        return this.weightedAverage(selectedPixels, band.name);
    }

    private chooseLuminanceBand(luminances: number[]): LuminanceBand {
        const q10 = this.quantile(luminances, 0.10);
        const q50 = this.quantile(luminances, 0.50);
        const q90 = this.quantile(luminances, 0.90);
        const q95 = this.quantile(luminances, 0.95);

        const isVeryLightSkin =
            q50 >= 170 &&
            q90 >= 195;

        if (isVeryLightSkin) {
            return {
                name: 'very-light-skin-upper-band',
                lower: 0.68,
                upper: 0.96,
            };
        }

        const isLightOrMediumLightSkin =
            q50 >= 145 &&
            q90 >= 190 &&
            q10 < 78;

        if (isLightOrMediumLightSkin) {
            return {
                name: 'light-medium-upper-band',
                lower: 0.55,
                upper: 0.92,
            };
        }

        const isUnderexposedMediumSkin =
            q50 >= 65 &&
            q50 <= 92 &&
            q90 <= 120 &&
            q95 >= 120;

        if (isUnderexposedMediumSkin) {
            return {
                name: 'underexposed-medium-highlight-band',
                lower: 0.85,
                upper: 0.98,
            };
        }

        const isShadowContaminatedLightSkin =
            q10 <= 58 &&
            q50 >= 132 &&
            q50 <= 150 &&
            q90 >= 180;

        if (isShadowContaminatedLightSkin) {
            return {
                name: 'shadow-contaminated-light-mid-band',
                lower: 0.25,
                upper: 0.78,
            };
        }

        const isShadowedMediumLightSkin =
            q10 <= 55 &&
            q50 >= 95 &&
            q50 <= 125 &&
            q90 >= 155 &&
            q95 >= 170;

        if (isShadowedMediumLightSkin) {
            return {
                name: 'shadowed-medium-light-upper-band',
                lower: 0.65,
                upper: 0.95,
            };
        }

        const isTrueDarkSkin =
            q50 <= 68 &&
            q90 <= 105 &&
            q95 <= 125;

        if (isTrueDarkSkin) {
            return {
                name: 'true-dark-low-mid-band',
                lower: 0.00,
                upper: 0.58,
            };
        }

        const isStrongHighlightedMediumSkin =
            q10 <= 65 &&
            q50 >= 130 &&
            q90 >= 170;

        if (isStrongHighlightedMediumSkin) {
            return {
                name: 'highlighted-medium-shadow-band',
                lower: 0.00,
                upper: 0.50,
            };
        }

        const isRegularHighlightedMediumSkin =
            q50 >= 130 &&
            q90 >= 165;

        if (isRegularHighlightedMediumSkin) {
            return {
                name: 'regular-medium-shadow-band',
                lower: 0.00,
                upper: 0.55,
            };
        }

        return {
            name: 'default-mid-band',
            lower: 0.12,
            upper: 0.72,
        };
    }

    private removeColorOutliers(pixels: SkinPixel[]): SkinPixel[] {
        if (pixels.length < 80) {
            return pixels;
        }

        const sortedByR = pixels.map(pixel => pixel.r).sort((a, b) => a - b);
        const sortedByG = pixels.map(pixel => pixel.g).sort((a, b) => a - b);
        const sortedByB = pixels.map(pixel => pixel.b).sort((a, b) => a - b);

        const minR = this.quantile(sortedByR, 0.04);
        const maxR = this.quantile(sortedByR, 0.96);

        const minG = this.quantile(sortedByG, 0.04);
        const maxG = this.quantile(sortedByG, 0.96);

        const minB = this.quantile(sortedByB, 0.04);
        const maxB = this.quantile(sortedByB, 0.96);

        return pixels.filter(pixel => {
            return (
                pixel.r >= minR &&
                pixel.r <= maxR &&
                pixel.g >= minG &&
                pixel.g <= maxG &&
                pixel.b >= minB &&
                pixel.b <= maxB
            );
        });
    }

    private weightedAverage(pixels: SkinPixel[], band: string): RGBWithSamples {
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let totalWeight = 0;

        for (const pixel of pixels) {
            totalR += pixel.r * pixel.weight;
            totalG += pixel.g * pixel.weight;
            totalB += pixel.b * pixel.weight;
            totalWeight += pixel.weight;
        }

        if (totalWeight === 0) {
            throw new Error('Não foi possível calcular a cor média da pele.');
        }

        return {
            r: Math.round(totalR / totalWeight),
            g: Math.round(totalG / totalWeight),
            b: Math.round(totalB / totalWeight),
            sampledPixels: pixels.length,
            band,
        };
    }

    private extractFallbackAverageColor(
        data: Buffer,
        width: number,
        height: number,
        channels: number,
    ): RGBWithSamples {
        const startX = Math.floor(width * 0.34);
        const endX = Math.floor(width * 0.66);
        const startY = Math.floor(height * 0.24);
        const endY = Math.floor(height * 0.52);

        const pixels: SkinPixel[] = [];

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                const index = (y * width + x) * channels;

                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];

                if (this.isAlmostWhite(r, g, b) || this.isAlmostBlack(r, g, b)) {
                    continue;
                }

                pixels.push({
                    x,
                    y,
                    r,
                    g,
                    b,
                    luminance: this.getLuminance(r, g, b),
                    weight: 1,
                });
            }
        }

        if (pixels.length === 0) {
            throw new Error('Não foi possível extrair cor da imagem.');
        }

        return this.calculateRobustSkinAverage(pixels);
    }

    private findNearestToneCalibrated(
        detectedColor: RGB,
        tones: SkinToneOption[],
    ): { tone: SkinToneOption; distance: number } {
        const detectedIta = this.rgbToIta(detectedColor);

        const calibratedType = this.getCalibratedTypeByIta(detectedIta);

        if (calibratedType !== null) {
            const calibratedTone = tones.find(tone => tone.type === calibratedType);

            if (calibratedTone) {
                const toneIta = this.rgbToIta(this.hexToRgb(calibratedTone.hex));

                return {
                    tone: calibratedTone,
                    distance: Math.abs(detectedIta - toneIta),
                };
            }
        }

        return this.findNearestToneByScore(detectedColor, tones);
    }

    private getCalibratedTypeByIta(ita: number): number | null {
        if (ita >= 65) {
            return 1;
        }

        if (ita >= 48 && ita < 65) {
            return 3;
        }

        if (ita >= -8 && ita <= 8) {
            return 7;
        }

        if (ita >= -28 && ita < -8) {
            return 5;
        }

        if (ita <= -68) {
            return 10;
        }

        if (ita > -68 && ita <= -52) {
            return 9;
        }

        if (ita > -52 && ita <= -32) {
            return 8;
        }

        return null;
    }

    private findNearestToneByScore(
        detectedColor: RGB,
        tones: SkinToneOption[],
    ): { tone: SkinToneOption; distance: number } {
        const detectedIta = this.rgbToIta(detectedColor);
        const detectedLab = this.rgbToLab(detectedColor);

        let bestTone = tones[0];
        let bestScore = Infinity;
        let bestDistance = Infinity;

        for (const tone of tones) {
            const toneRgb = this.hexToRgb(tone.hex);
            const toneLab = this.rgbToLab(toneRgb);

            const toneIta = this.rgbToIta(toneRgb);
            const itaDistance = Math.abs(detectedIta - toneIta);
            const colorDistance = this.deltaE(detectedLab, toneLab);

            const score = itaDistance * 1.65 + colorDistance * 0.35;

            if (score < bestScore) {
                bestScore = score;
                bestDistance = itaDistance;
                bestTone = tone;
            }
        }

        return {
            tone: bestTone,
            distance: bestDistance,
        };
    }

    private rgbToIta(rgb: RGB): number {
        const lab = this.rgbToLab(rgb);

        if (lab.b === 0) {
            return 0;
        }

        return Math.atan2(lab.l - 50, lab.b) * (180 / Math.PI);
    }

    private distanceToConfidence(distance: number): number {
        const confidence = Math.max(0, Math.min(1, 1 - distance / 35));

        return Number(confidence.toFixed(2));
    }

    private getLuminance(r: number, g: number, b: number): number {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    private quantile(values: number[], q: number): number {
        if (values.length === 0) {
            return 0;
        }

        const position = (values.length - 1) * q;
        const base = Math.floor(position);
        const rest = position - base;

        const nextValue = values[base + 1];

        if (nextValue !== undefined) {
            return values[base] + rest * (nextValue - values[base]);
        }

        return values[base];
    }

    private isAlmostWhite(r: number, g: number, b: number): boolean {
        return r >= 235 && g >= 235 && b >= 235;
    }

    private isAlmostBlack(r: number, g: number, b: number): boolean {
        return r <= 18 && g <= 18 && b <= 18;
    }

    private isAlmostGray(r: number, g: number, b: number): boolean {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);

        return max - min <= 6;
    }

    private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
        const rn = r / 255;
        const gn = g / 255;
        const bn = b / 255;

        const max = Math.max(rn, gn, bn);
        const min = Math.min(rn, gn, bn);
        const delta = max - min;

        let h = 0;

        if (delta !== 0) {
            if (max === rn) {
                h = 60 * (((gn - bn) / delta) % 6);
            } else if (max === gn) {
                h = 60 * ((bn - rn) / delta + 2);
            } else {
                h = 60 * ((rn - gn) / delta + 4);
            }
        }

        if (h < 0) {
            h += 360;
        }

        const s = max === 0 ? 0 : delta / max;
        const v = max;

        return { h, s, v };
    }

    private rgbToYCbCr(r: number, g: number, b: number): { y: number; cb: number; cr: number } {
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        return { y, cb, cr };
    }

    private rgbToLab(rgb: RGB): Lab {
        let r = rgb.r / 255;
        let g = rgb.g / 255;
        let b = rgb.b / 255;

        r = r > 0.04045
            ? Math.pow((r + 0.055) / 1.055, 2.4)
            : r / 12.92;

        g = g > 0.04045
            ? Math.pow((g + 0.055) / 1.055, 2.4)
            : g / 12.92;

        b = b > 0.04045
            ? Math.pow((b + 0.055) / 1.055, 2.4)
            : b / 12.92;

        const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
        const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
        const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

        const fx = this.labPivot(x);
        const fy = this.labPivot(y);
        const fz = this.labPivot(z);

        return {
            l: 116 * fy - 16,
            a: 500 * (fx - fy),
            b: 200 * (fy - fz),
        };
    }

    private labPivot(value: number): number {
        return value > 0.008856
            ? Math.cbrt(value)
            : 7.787 * value + 16 / 116;
    }

    private deltaE(a: Lab, b: Lab): number {
        return Math.sqrt(
            Math.pow(a.l - b.l, 2) +
            Math.pow(a.a - b.a, 2) +
            Math.pow(a.b - b.b, 2),
        );
    }

    private hexToRgb(hex: string): RGB {
        const cleanHex = hex.replace('#', '').trim();

        if (!/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
            throw new Error(`Hex inválido: ${hex}`);
        }

        return {
            r: parseInt(cleanHex.substring(0, 2), 16),
            g: parseInt(cleanHex.substring(2, 4), 16),
            b: parseInt(cleanHex.substring(4, 6), 16),
        };
    }

    private rgbToHex(rgb: RGB): string {
        const toHex = (value: number): string => {
            return Math.max(0, Math.min(255, value))
                .toString(16)
                .padStart(2, '0');
        };

        return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
    }

    private validateTones(tones: SkinToneOption[]): void {
        if (!Array.isArray(tones) || tones.length === 0) {
            throw new Error('O JSON de tons precisa ser um array com pelo menos um item.');
        }

        for (const tone of tones) {
            if (
                typeof tone !== 'object' ||
                typeof tone.type !== 'number' ||
                typeof tone.hex !== 'string'
            ) {
                throw new Error('Cada tom precisa ter o formato: { type: number, hex: string }');
            }

            this.hexToRgb(tone.hex);
        }
    }
}
