export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#050B0A",
        panel: "#0C1715",
        ridge: "#12251F",
        ember: "#1B342C",
        senior: "#10B981",
        junior: "#38BDF8",
        rebalance: "#F59E0B",
        rose: "#F43F5E",
        mute: "#7C948A",
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        pane: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 24px 60px -30px rgba(0,0,0,0.9)",
      },
    },
  },
  plugins: [],
};
