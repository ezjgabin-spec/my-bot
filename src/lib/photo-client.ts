/** Browser-only image preparation. No original photo is persisted in the app. */
export async function prepareStudyPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 12_000_000) throw new Error("Choose a photo smaller than 12 MB.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to open this image. Try JPG or PNG."));
      image.src = url;
    });
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (!naturalWidth || !naturalHeight) throw new Error("Empty image.");
    const scale = Math.min(1, 1800 / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Photo processing is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg", 0.78).split(",")[1];
    if (!base64 || base64.length > 2_000_000)
      throw new Error("Photo is too detailed. Crop it or take a closer photo and try again.");
    return base64;
  } finally {
    URL.revokeObjectURL(url);
  }
}
