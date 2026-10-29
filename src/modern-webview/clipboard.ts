/** Copies text to the clipboard, swallowing the failures older webview hosts report. */
export async function copyText(value: string): Promise<void> {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}
