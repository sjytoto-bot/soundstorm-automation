// ─── contentPackMock ──────────────────────────────────────────────────────────
// Content Pack AUTO 생성 Mock (백엔드 미연결 시 fallback)
// Controller에서 직접 import해서 사용

import type { AutoField } from "@/core/types/contentPack";

export function mockGenerate(
  theme: string,
  field: AutoField,
): string | string[] {
  const t  = theme.trim() || "Epic Music";
  const tu = t.toUpperCase();
  const tl = t.toLowerCase();

  switch (field) {
    case "title":
      return `${tu} | Epic Cinematic Music | SOUNDSTORM`;

    case "suno_prompt":
      return `epic ${tl} music, dark cinematic atmosphere, powerful drums, orchestral`;

    case "thumbnail_text":
      return tu.split(" ").slice(0, 2).join("\n");

    case "description":
      return (
        `Epic ${t} music crafted for cinematic experiences, gaming, and powerful performances.\n\n` +
        `Perfect for martial arts demonstrations, dramatic scenes, and epic storytelling.\n\n` +
        `🎵 SOUNDSTORM — Music that moves you.`
      );

    case "hashtags":
      return [
        `#${t.replace(/\s+/g, "").toLowerCase()}`,
        "#epicmusic",
        "#cinematicmusic",
        "#soundstorm",
        "#bgm",
      ];

    case "keywords":
      return [
        `${tl} music`,
        "epic cinematic music",
        "soundstorm bgm",
        `${tl} bgm`,
      ];

    default:
      return "";
  }
}
