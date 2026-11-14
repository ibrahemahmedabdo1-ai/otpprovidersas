import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OTPProvider", short_name: "OTPProvider", start_url: "/en", display: "browser",
    background_color: "#0A0F24", theme_color: "#6366F1",
    icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
