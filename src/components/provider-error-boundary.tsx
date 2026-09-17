"use client";

import { Component, ReactNode } from "react";

interface ProviderErrorBoundaryProps {
  children: ReactNode;
  providerName: string;
  fallback?: ReactNode;
}

interface ProviderErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ProviderErrorBoundary extends Component<
  ProviderErrorBoundaryProps,
  ProviderErrorBoundaryState
> {
  constructor(props: ProviderErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ProviderErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`${this.props.providerName} crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || this.props.children;
    }
    return this.props.children;
  }
}
