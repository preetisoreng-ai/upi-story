/*
  Shared frame layout for every aspect ratio (16:9, 1:1, 9:16).
  The stage (morphing chart) and the end card both call UPI_LAYOUT(W, H) so the chart can
  land exactly on the radial inside the end card's laptop screen.
*/
(function () {
  function layout(W, H) {
    const ar = W / H;
    const kind = ar > 1.3 ? "landscape" : ar < 0.8 ? "portrait" : "square";
    let L;
    if (kind === "landscape") {
      L = {
        shape: { cx: W * 0.69, cy: H * 0.52, R: H * 0.385 },
        plot: { x0: W * 0.47, x1: W * 0.92, top: H * 0.2, base: H * 0.8 },
        laptop: { x: 830, y: 170, w: 940, h: 529 },
        phone: { x: 1530, y: 380, w: 250, h: 541 },
      };
    } else if (kind === "portrait") {
      // Text lives in 200-700 px; everything important stays above 1330 px (platform UI below).
      L = {
        shape: { cx: W * 0.5, cy: 1060, R: 300 },
        plot: { x0: 100, x1: 980, top: 800, base: 1310 },
        laptop: { x: 70, y: 780, w: 800, h: 450 },
        phone: { x: 770, y: 900, w: 230, h: 498 },
      };
    } else {
      L = {
        shape: { cx: W * 0.5, cy: H * 0.705, R: H * 0.255 },
        plot: { x0: 110, x1: 970, top: 540, base: 1010 },
        laptop: { x: 70, y: 450, w: 760, h: 428 },
        phone: { x: 790, y: 520, w: 210, h: 455 },
      };
    }
    L.kind = kind;
    L.W = W;
    L.H = H;
    // Where the radial sits inside the captured desktop screenshot (1920x1080 page):
    // centre (1232, 576), outer ring radius 307 px.
    const lp = L.laptop;
    L.screenRadial = {
      cx: lp.x + (1232 / 1920) * lp.w,
      cy: lp.y + (576 / 1080) * lp.h,
      R: (307 / 1080) * lp.h,
    };
    return L;
  }
  window.UPI_LAYOUT = layout;
})();
