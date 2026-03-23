export async function readHistoryFromFile() {
  if (window.api?.readHistory) {
    return await window.api.readHistory();
  }
  return [];
}

export async function appendHistoryToFile(event) {
  if (window.api?.appendHistory) {
    await window.api.appendHistory(event);
  }
}
