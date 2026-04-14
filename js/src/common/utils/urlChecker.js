export default function urlChecker(url) {
  return /^https?:\/\//i.test(url);
}
