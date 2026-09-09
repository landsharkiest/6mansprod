export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <span>Not affiliated with rl6mans.com</span>
        <span aria-hidden="true">&middot;</span>
        <span>Clips belong to their uploaders</span>
        <span aria-hidden="true">&middot;</span>
        {/* TODO: point at the real repo once it's public. */}
        <a href="https://github.com/6mansdle/6mansdle" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>
    </footer>
  );
}
