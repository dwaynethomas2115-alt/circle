import { ScrollViewStyleReset } from "expo-router/html";
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="robots" content="noindex,nofollow,noarchive" />
        <meta name="theme-color" content="#137F70" />
        <title>Circle — Your people. Your place.</title>
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
