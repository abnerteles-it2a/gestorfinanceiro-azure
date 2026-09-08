import { useEffect } from 'react';

/**
 * Hook to manage frontend security measures.
 * Currently implements:
 * - Context Menu (Right Click) blocking
 */
export const useSecurity = () => {
  useEffect(() => {
    // 1. Block Context Menu (Right Click)
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      e.preventDefault();
    };

    // 2. Block Keyboard Shortcuts (F12, Ctrl+Shift+I, Ctrl+U, etc.)
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12
      if (e.keyCode === 123) {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+I (Inspect)
      if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) {
        e.preventDefault();
        return false;
      }

      // Ctrl+U (View Source)
      if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        return false;
      }

      // Ctrl+S (Save Page)
      if (e.ctrlKey && e.keyCode === 83) {
        e.preventDefault();
        return false;
      }
    };

    // 3. Debugger Loop (Premium Protection)
    // This pauses execution if DevTools is open
    const debuggerInterval = setInterval(() => {
      // Only run debugger if not in a dev environment to avoid annoying the developer
      // But since we want "maximum security" as requested:
      (function() {
        (function a() {
          try {
            (function b(i: number) {
              if (("" + i / i).length !== 1 || i % 20 === 0) {
                (function() {}).constructor("debugger")();
              } else {
                debugger;
              }
              b(++i);
            })(0);
          } catch (e) {}
        })();
      })();
    }, 1000);

    // 4. Console Premium Message
    console.log(
      "%c🛡️ SISTEMA PROTEGIDO %c\nEsta aplicação utiliza protocolos de segurança avançados para proteger a propriedade intelectual da it2a.",
      "color: #6366f1; font-size: 20px; font-weight: bold; background: #0f172a; padding: 10px; border-radius: 8px;",
      "color: #94a3b8; font-size: 12px;"
    );

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(debuggerInterval);
    };
  }, []);
};
