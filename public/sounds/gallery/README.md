# public/sounds/gallery

일반 갤러리 반응 효과음(굿샷 등)을 넣는 폴더입니다.

카탈로그(`src/data/soundCatalog.json`)가 참조하는 파일:
- `good-shot.mp3` — `gallery_good_shot` 항목 (rightsStatus: review_required, 아직 실제 파일 없음)

## 새 사운드 추가 방법

1. mp3/ogg/wav 파일을 이 폴더에 넣습니다.
2. `src/data/soundCatalog.json`의 `sounds` 배열에 새 항목을 추가합니다.

```json
{
  "id": "gallery_awesome_shot",
  "label": "어썸샷",
  "category": "gallery",
  "sourceType": "file",
  "src": "/sounds/gallery/awesome-shot.mp3",
  "language": "ko-KR",
  "voiceGender": "mixed",
  "targets": ["phone", "headphones", "watch"],
  "volume": 0.9,
  "cooldownMs": 3000,
  "rightsStatus": "original",
  "enabled": true,
  "icon": "thumbs-up",
  "tone": "green"
}
```

코드를 수정할 필요 없이 파일 추가 + JSON 항목만으로 GalleryPanel에 버튼이 자동으로 생성됩니다. `rightsStatus`가 `prototype_only` 또는 `review_required`이면 개발 모드에서 작은 경고 배지가 표시됩니다. 실제 출시 전에는 반드시 음원 저작권/초상권 검토를 마쳐야 합니다.
