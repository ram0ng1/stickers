export default function urlChecker(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
