# public/sounds/caddie

캐디 음성 안내(거리 안내, 클럽 추천 등) 사운드를 넣는 폴더입니다.
현재 GalleryPanel은 `gallery` / `team` / `achievement` 카테고리만 노출하므로, `category: "caddie"` 항목은 카탈로그에는 등록되지만 아직 화면에 자동 노출되지는 않습니다. 향후 캐디 안내 패널을 만들 때 `getSoundCatalog()`에서 `category === "caddie"`인 항목을 그대로 재사용할 수 있습니다.
