import { MessageCircle } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useLocation } from "wouter";

declare global {
  interface Window {
    Tawk_API?: {
      toggle: () => void;
    };
  }
}

export function FloatingButtons() {
  const [location] = useLocation();

  if (location === "/") return null;

  const handleChatClick = () => {
    if (window.Tawk_API && typeof window.Tawk_API.toggle === "function") {
      window.Tawk_API.toggle();
    }
  };

  return (
    <div
      className="fixed bottom-6 right-6 flex flex-col gap-3 z-[9999]"
      data-testid="floating-buttons-container"
    >
      <a
        href="https://wa.me/447311121217"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        data-testid="button-whatsapp"
        className="flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform duration-150 active:scale-95"
        style={{ backgroundColor: "#25D366", color: "#ffffff" }}
      >
        <SiWhatsapp size={28} />
      </a>

      <button
        onClick={handleChatClick}
        aria-label="Open live chat"
        data-testid="button-live-chat"
        className="flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform duration-150 active:scale-95"
        style={{ backgroundColor: "#1a73e8", color: "#ffffff" }}
      >
        <MessageCircle size={26} />
      </button>
    </div>
  );
}
