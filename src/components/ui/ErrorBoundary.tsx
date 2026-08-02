import { Component, ErrorInfo, ReactNode } from "react";

import { Box, Button, Typography } from "@mui/material";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level React error boundary: catches render-time errors anywhere in the
 * tree below it and shows a recoverable fallback instead of a blank screen.
 * componentDidCatch is the single seam for wiring up remote error reporting.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          minHeight: "60vh",
          textAlign: "center",
          p: 4,
        }}
      >
        <Typography variant="h5">Something went wrong</Typography>
        <Typography color="text.secondary">
          An unexpected error occurred. Try reloading the page.
        </Typography>
        <Button variant="contained" onClick={this.handleReload}>
          Reload
        </Button>
      </Box>
    );
  }
}
