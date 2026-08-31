import { OverallCalculator } from "../utils/overall-calculator";
import { SkinToneDetector } from "../utils/skin-tone-detector/skin-tone-detector";
import assert from "node:assert/strict";

const test = async () => {
    const json = [
        {
            "type": 1,
            "hex": "#e2bab3"
        },
        {
            "type": 2,
            "hex": "#c79e92"
        },
        {
            "type": 3,
            "hex": "#c49e8f"
        },
        {
            "type": 4,
            "hex": "#a47561"
        },
        {
            "type": 5,
            "hex": "#8f5d49"
        },
        {
            "type": 6,
            "hex": "#835540"
        },
        {
            "type": 7,
            "hex": "#916b5a"
        },
        {
            "type": 8,
            "hex": "#735648"
        },
        {
            "type": 9,
            "hex": "#594135"
        },
        {
            "type": 10,
            "hex": "#463127"
        }
    ]

    const url = 'https://img.a.transfermarkt.technology/portrait/header/515208-1723486899.png?lm=1'

    const service = new SkinToneDetector()

    const result = await service.getTone(json, url)

    console.log(result)

    const calleri = await service.getTone(json, "https://img.a.transfermarkt.technology/portrait/header/284727-1738840512.jpg?lm=1");
    assert.ok(calleri.type <= 5, `Calleri should not be classified as dark skin tone 8+, received ${calleri.type}`);

    const pabloMaia = await service.getTone(json, "https://img.a.transfermarkt.technology/portrait/header/892089-1709321103.jpg?lm=1");
    assert.ok(pabloMaia.type <= 4, `Pablo Maia should be classified as light/medium skin tone, received ${pabloMaia.type}`);

    console.log("Skin tone detector tests passed.");
};

test().catch(err => {
    console.error("Test failed:", err);
});
