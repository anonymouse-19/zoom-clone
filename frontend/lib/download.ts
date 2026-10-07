/**
 * Make the browser download something built in the page (a chat transcript, a meeting
 * recording), without a server round trip.
 *
 * How: a temporary URL for the data (`URL.createObjectURL`), and a click on a hidden
 * `<a download>` link pointing at it.
 */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
