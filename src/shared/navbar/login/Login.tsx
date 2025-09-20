import AuthOverlay from "@shared/authOverlay/AuthOverlay";
import { NavElem } from "@shared/navbar/NavElem";
import { FC, useCallback, useState } from "react";

export const Login: FC = () => {
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const handleClose = useCallback(() => setShowAuthOverlay(false), []);
  return (
    <>
      <NavElem to="#"
        onClick={() => setShowAuthOverlay(true)}
        data-cy="login-button"
      >Login</NavElem>
      {showAuthOverlay && (
        <AuthOverlay isOpen={showAuthOverlay} setIsOpen={setShowAuthOverlay} onClose={handleClose} />
      )}
    </>
  );
};
