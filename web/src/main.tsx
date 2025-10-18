import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ImageGalleryWidget } from "./widget/ImageGalleryWidget.js";

const ROOT_ELEMENT_ID = "pixabay-gallery-root";

function mount() {
  const container = document.getElementById(ROOT_ELEMENT_ID);
  if (!container) {
    throw new Error(`Missing root element with id "${ROOT_ELEMENT_ID}".`);
  }

  const root = createRoot(container);

  root.render(
    <StrictMode>
      <ImageGalleryWidget />
    </StrictMode>
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
