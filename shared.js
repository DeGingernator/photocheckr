// assets/shared.js
export function lazyLoad(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
// compatibility no-op
export async function injectPartials() { /* no-op */ }
