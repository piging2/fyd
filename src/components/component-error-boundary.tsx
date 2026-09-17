"use client";

import { Component, ReactNode } from "react";

interface ComponentErrorBoundaryProps {
  children: ReactNode;
  componentName: string;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ComponentErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ComponentErrorBoundary extends Component<
  ComponentErrorBoundaryProps,
  ComponentErrorBoundaryState
> {
  constructor(props: ComponentErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ComponentErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`${this.props.componentName} crashed:`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
          <p className="text-red-600 font-semibold">Something went wrong</p>
          <p className="text-red-500 text-sm mt-1">
            {this.props.componentName} encountered an error. Please refresh the page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
