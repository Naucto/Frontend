
import { useTheme } from "@theme/ThemeContext";

const NavProfil: React.FC = () => {
  const theme = useTheme();

  return (
    <div>
      <img className="navbar-logo" src={theme.logo.primary} alt="Logo" />
    </div>
  );
};

export default NavProfil;
