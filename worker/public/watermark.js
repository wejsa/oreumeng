export const watermarkLayout = ({ canvasWidth, canvasHeight, logoWidth, logoHeight }) => {
  const values = [canvasWidth, canvasHeight, logoWidth, logoHeight];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("invalid-watermark-dimensions");
  }

  const margin = Math.max(12, Math.round(Math.min(canvasWidth, canvasHeight) * 0.025));
  const scale = Math.min(
    (canvasWidth * 0.34) / logoWidth,
    (canvasHeight * 0.25) / logoHeight,
  );
  const width = Math.max(1, Math.round(logoWidth * scale));
  const height = Math.max(1, Math.round(logoHeight * scale));

  return {
    x: canvasWidth - width - margin,
    y: canvasHeight - height - margin,
    width,
    height,
    opacity: 0.55,
  };
};
