export function retryEvery(retry: () => void): () => void {
  const timer = setInterval(retry, 1000);
  return () => clearInterval(timer);
}
