import AuthOverlay from "@shared/authOverlay/AuthOverlay";
import { NavElem } from "@shared/navbar/NavElem";
import { FC, useCallback, useEffect, useState } from "react";

type LoginProps = {
  forceShowAuthOverlay: boolean;
  setForceShowAuthOverlay: (isOpen: boolean) => void;
};

export const Login: FC<LoginProps> = ({ forceShowAuthOverlay, setForceShowAuthOverlay }) => {
  const [showAuthOverlay, setShowAuthOverlay] = useState(false);
  const handleClose = useCallback(() => setShowAuthOverlay(false), []);

  useEffect(() => {
    if (forceShowAuthOverlay) {
      setShowAuthOverlay(true);
      setForceShowAuthOverlay(false);
    }
  }, [forceShowAuthOverlay, setForceShowAuthOverlay]);
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
