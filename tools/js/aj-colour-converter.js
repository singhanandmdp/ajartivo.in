(function () {
    "use strict";

    window.AjArtivoTools = window.AjArtivoTools || {};
    window.AjArtivoTools.colourConverter = true;

    document.addEventListener("DOMContentLoaded", initColourStudio);

    function initColourStudio() {
        const hexInput = document.getElementById("hexInput");
        const rgbInput = document.getElementById("rgbInput");
        const hslInput = document.getElementById("hslInput");
        const cmykInput = document.getElementById("cmykInput");
        const nativePicker = document.getElementById("nativeColorPicker");
        const previewBox = document.getElementById("colorPreviewBox");
        const previewLabel = document.getElementById("colorPreviewHex");
        const contrastBlack = document.getElementById("contrastBlack");
        const contrastWhite = document.getElementById("contrastWhite");
        const harmonyContainer = document.getElementById("harmonySwatches");
        const toast = document.getElementById("copyToast");

        if (!hexInput || !previewBox) return;

        let currentColor = { r: 37, g: 99, b: 235 }; // #2563eb default

        function updateFromRgb(r, g, b) {
            currentColor = {
                r: Math.max(0, Math.min(255, Math.round(r))),
                g: Math.max(0, Math.min(255, Math.round(g))),
                b: Math.max(0, Math.min(255, Math.round(b)))
            };

            const hex = rgbToHex(currentColor.r, currentColor.g, currentColor.b);
            const hsl = rgbToHsl(currentColor.r, currentColor.g, currentColor.b);
            const cmyk = rgbToCmyk(currentColor.r, currentColor.g, currentColor.b);

            hexInput.value = hex;
            rgbInput.value = `${currentColor.r}, ${currentColor.g}, ${currentColor.b}`;
            hslInput.value = `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`;
            cmykInput.value = `${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%`;
            if (nativePicker) nativePicker.value = hex;

            previewBox.style.backgroundColor = hex;
            if (previewLabel) previewLabel.textContent = hex.toUpperCase();

            // Update contrast
            updateContrast(currentColor.r, currentColor.g, currentColor.b);

            // Update harmonies
            updateHarmonies(hsl.h, hsl.s, hsl.l);
        }

        function updateContrast(r, g, b) {
            const lum = getLuminance(r, g, b);
            const ratioWhite = (1 + 0.05) / (lum + 0.05);
            const ratioBlack = (lum + 0.05) / (0 + 0.05);

            if (contrastWhite) {
                contrastWhite.textContent = `${ratioWhite.toFixed(2)}:1 (${ratioWhite >= 4.5 ? 'AA Pass' : 'Fail'})`;
                contrastWhite.style.color = ratioWhite >= 4.5 ? '#4ade80' : '#f87171';
            }
            if (contrastBlack) {
                contrastBlack.textContent = `${ratioBlack.toFixed(2)}:1 (${ratioBlack >= 4.5 ? 'AA Pass' : 'Fail'})`;
                contrastBlack.style.color = ratioBlack >= 4.5 ? '#4ade80' : '#f87171';
            }
        }

        function updateHarmonies(h, s, l) {
            if (!harmonyContainer) return;
            harmonyContainer.innerHTML = "";

            const harmonies = [
                { name: "Complementary", angle: (h + 180) % 360 },
                { name: "Analogous 1", angle: (h + 30) % 360 },
                { name: "Analogous 2", angle: (h + 330) % 360 },
                { name: "Triadic 1", angle: (h + 120) % 360 },
                { name: "Triadic 2", angle: (h + 240) % 360 },
                { name: "Tint Light", angle: h, s: Math.max(0, s - 20), l: Math.min(95, l + 20) },
                { name: "Shade Dark", angle: h, s: s, l: Math.max(10, l - 25) }
            ];

            harmonies.forEach(function (harm) {
                const sat = typeof harm.s !== "undefined" ? harm.s : s;
                const light = typeof harm.l !== "undefined" ? harm.l : l;
                const rgb = hslToRgb(harm.angle, sat, light);
                const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

                const card = document.createElement("div");
                card.className = "harmony-swatch";
                card.style.backgroundColor = hex;
                card.title = `Click to copy ${harm.name} (${hex})`;

                const label = document.createElement("span");
                label.textContent = hex.toUpperCase();
                card.appendChild(label);

                card.addEventListener("click", function () {
                    copyToClipboard(hex, `Copied ${harm.name}: ${hex}`);
                });

                harmonyContainer.appendChild(card);
            });
        }

        // Copy buttons
        document.querySelectorAll("[data-copy-target]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                const targetId = btn.getAttribute("data-copy-target");
                const input = document.getElementById(targetId);
                if (input) {
                    copyToClipboard(input.value, `Copied ${input.value}`);
                }
            });
        });

        // Event listeners for inputs
        hexInput.addEventListener("input", function () {
            let val = hexInput.value.trim();
            if (!val.startsWith("#")) val = "#" + val;
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                const rgb = hexToRgb(val);
                if (rgb) updateFromRgb(rgb.r, rgb.g, rgb.b);
            }
        });

        if (nativePicker) {
            nativePicker.addEventListener("input", function () {
                const rgb = hexToRgb(nativePicker.value);
                if (rgb) updateFromRgb(rgb.r, rgb.g, rgb.b);
            });
        }

        rgbInput.addEventListener("change", function () {
            const parts = rgbInput.value.split(",").map(function (n) { return parseInt(n.trim(), 10); });
            if (parts.length === 3 && parts.every(function (n) { return !isNaN(n); })) {
                updateFromRgb(parts[0], parts[1], parts[2]);
            }
        });

        hslInput.addEventListener("change", function () {
            const parts = hslInput.value.replace(/[%°]/g, "").split(",").map(function (n) { return parseFloat(n.trim()); });
            if (parts.length === 3 && parts.every(function (n) { return !isNaN(n); })) {
                const rgb = hslToRgb(parts[0], parts[1], parts[2]);
                updateFromRgb(rgb.r, rgb.g, rgb.b);
            }
        });

        function copyToClipboard(text, msg) {
            navigator.clipboard.writeText(text).then(function () {
                showToast(msg);
            }).catch(function () {
                showToast(`Copied: ${text}`);
            });
        }

        function showToast(msg) {
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.add("visible");
            clearTimeout(toast._timer);
            toast._timer = setTimeout(function () {
                toast.classList.remove("visible");
            }, 2000);
        }

        // Initialize with default color
        updateFromRgb(37, 99, 235);
    }

    /* Math Utilities */
    function rgbToHex(r, g, b) {
        return "#" + [r, g, b].map(function (x) {
            const hex = x.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join("");
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    function hslToRgb(h, s, l) {
        h = h / 360; s = s / 100; l = l / 100;
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = function (p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }

    function rgbToCmyk(r, g, b) {
        let c = 1 - (r / 255);
        let m = 1 - (g / 255);
        let y = 1 - (b / 255);
        let k = Math.min(c, Math.min(m, y));
        if (k === 1) {
            return { c: 0, m: 0, y: 0, k: 100 };
        }
        c = (c - k) / (1 - k);
        m = (m - k) / (1 - k);
        y = (y - k) / (1 - k);
        return {
            c: Math.round(c * 100),
            m: Math.round(m * 100),
            y: Math.round(y * 100),
            k: Math.round(k * 100)
        };
    }

    function getLuminance(r, g, b) {
        const a = [r, g, b].map(function (v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    }
})();
