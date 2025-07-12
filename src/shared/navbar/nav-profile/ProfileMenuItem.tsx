import { MenuItem, styled, Typography } from "@mui/material";
import { FC, JSX } from "react";

const StyledMenuItem = styled(MenuItem)(({ theme }) => ({
  "&:hover": {
    backgroundColor: theme.palette.gray[500],
  },
  margin: theme.spacing(1),
  padding: theme.spacing(1),
  borderRadius: theme.spacing(0.5),
  width: theme.spacing(23)
}));

const IconWrapper = styled("div")(({ theme }) => ({
  marginRight: theme.spacing(1),
  display: "flex",
}));

export const ProfileMenuItem: FC<{
  icon: JSX.Element;
  text: string;
  onClick?: () => void;
}> = ({ icon, text, onClick }) => {
  return (
    <StyledMenuItem onClick={onClick}>
      <IconWrapper>
        {icon}
      </IconWrapper>
      <Typography>{text}</Typography>
    </StyledMenuItem>
  );
};
