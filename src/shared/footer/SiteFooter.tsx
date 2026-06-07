import React from "react";
import { Box, Link as MuiLink, Typography } from "@mui/material";
import { styled } from "@mui/material/styles";
import GitHubIcon from "@mui/icons-material/GitHub";
import XIcon from "@mui/icons-material/X";
import RedditIcon from "@mui/icons-material/Reddit";
import LinkedInIcon from "@mui/icons-material/LinkedIn";
import ArticleIcon from "@mui/icons-material/Article";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { DOCUMENTATION_URL } from "@shared/docs/DocumentationFrame";
import {
  GITHUB_URL,
  LICENSE_URL,
  LINKEDIN_URL,
  REDDIT_URL,
  X_URL,
} from "@shared/constants/links";
import { FeedbackLanguagePicker } from "@shared/feedback/FeedbackLanguagePicker";

const footerLinks = [
  { label: "GitHub", href: GITHUB_URL, icon: <GitHubIcon fontSize="small" /> },
  { label: "X", href: X_URL, icon: <XIcon fontSize="small" /> },
  { label: "Reddit", href: REDDIT_URL, icon: <RedditIcon fontSize="small" /> },
  { label: "LinkedIn", href: LINKEDIN_URL, icon: <LinkedInIcon fontSize="small" /> },
  { label: "Documentation", href: DOCUMENTATION_URL, icon: <ArticleIcon fontSize="small" /> },
  { label: "License", href: LICENSE_URL, icon: <ArticleIcon fontSize="small" /> },
];

const Footer = styled("footer")(({ theme }) => ({
  flexShrink: 0,
  margin: theme.spacing(1, 2),
  padding: theme.spacing(2, 2.5),
  borderRadius: theme.custom.rounded.md,
  backgroundColor: theme.palette.gray[900],
  border: `1px solid ${theme.palette.gray[700]}`,
  color: theme.palette.gray[200],
}));

const FooterInner = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: theme.spacing(2),
  flexWrap: "wrap",
}));

const LinkList = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
  gap: theme.spacing(0.75, 1.25),
}));

const FooterLink = styled(MuiLink)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: theme.spacing(0.5),
  color: theme.palette.gray[100],
  textDecoration: "none",
  fontSize: "14px",
  lineHeight: 1.2,
  "&:hover": {
    color: theme.palette.yellow[500],
  },
}));

const FooterActionButton = styled("button")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: theme.spacing(0.5),
  color: theme.palette.gray[100],
  textDecoration: "none",
  fontSize: "14px",
  lineHeight: 1.2,
  border: "none",
  background: "transparent",
  fontFamily: theme.typography.fontFamily,
  cursor: "pointer",
  padding: 0,
  "&:hover": {
    color: theme.palette.yellow[500],
  },
}));

export const SiteFooter: React.FC = () => {
  return (
    <Footer>
      <FooterInner>
        <Typography variant="body2" color="gray.300">
          Copyright {new Date().getFullYear()} Naucto
        </Typography>
        <LinkList>
          {footerLinks.map((link) => (
            <FooterLink
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.icon}
              {link.label}
            </FooterLink>
          ))}
          <FeedbackLanguagePicker>
            {(openFeedbackDialog) => (
              <FooterActionButton type="button" onClick={openFeedbackDialog}>
                <OpenInNewIcon fontSize="small" />
                Feedback
              </FooterActionButton>
            )}
          </FeedbackLanguagePicker>
        </LinkList>
      </FooterInner>
    </Footer>
  );
};
