import type React from "react";

export function setDragGhost(event: React.DragEvent, title: string, subtitle?: string) {
  try {
    const ghost = document.createElement("div");
    ghost.style.position = "fixed";
    ghost.style.top = "-9999px";
    ghost.style.left = "-9999px";
    ghost.style.padding = "5px 11px";
    ghost.style.background = "#222a30";
    ghost.style.color = "#ffffff";
    ghost.style.borderRadius = "6px";
    ghost.style.fontSize = "11px";
    ghost.style.fontWeight = "700";
    ghost.style.boxShadow = "0 6px 20px rgba(0, 0, 0, 0.35)";
    ghost.style.display = "flex";
    ghost.style.alignItems = "center";
    ghost.style.gap = "6px";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "99999";
    ghost.style.whiteSpace = "nowrap";

    const titleSpan = document.createElement("span");
    titleSpan.textContent = title;
    ghost.appendChild(titleSpan);

    if (subtitle) {
      const subSpan = document.createElement("span");
      subSpan.textContent = subtitle;
      subSpan.style.color = "#7cc3bc";
      subSpan.style.fontSize = "10px";
      subSpan.style.fontWeight = "400";
      ghost.appendChild(subSpan);
    }

    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 15, 12);
    setTimeout(() => {
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    }, 0);
  } catch {
    // 忽略不支持 setDragImage 的降级环境
  }
}
