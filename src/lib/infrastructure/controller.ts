/**
 * Happy Place Automation Platform - Infrastructure Controller
 * 
 * Central service for managing all business infrastructure.
 * One interface, one authentication system, one audit, one repair system.
 * 
 * Supported Services:
 * - Google (Sheets, Drive, Gmail, Calendar, Business Profile, Apps Script, Cloud Scheduler, Analytics)
 * - GitHub
 * - Vercel
 * - Cloudflare
 * - Stripe
 * - Twilio
 * - Resend
 * - OpenAI
 * - Anthropic
 * - Computer Use
 * - Claude
 */

export interface ServiceConfig {
  name: string;
  type: 'google' | 'github' | 'vercel' | 'stripe' | 'twilio' | 'resend' | 'openai' | 'anthropic' | 'cloudflare';
  required: boolean;
  dependencies: string[];
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'missing' | 'error';
  configured: boolean;
  connected: boolean;
  operational: boolean;
  lastChecked: string;
  error?: string;
}

export interface ControllerState {
  services: Map<string, ServiceStatus>;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  lastAudit: string;
}

/**
 * Infrastructure Controller
 * 
 * Central management for all business infrastructure services.
 * Provides unified interface for discovery, configuration, verification, and maintenance.
 */
export class InfrastructureController {
  private state: ControllerState;
  private services: Map<string, ServiceConfig>;

  constructor() {
    this.state = {
      services: new Map(),
      overallHealth: 'healthy',
      lastAudit: '',
    };
    
    this.services = new Map(this.getDefaultServices());
  }

  /**
   * Get default service configurations
   */
  private getDefaultServices(): [string, ServiceConfig][] {
    return [
      ['google-workspace', {
        name: 'Google Workspace',
        type: 'google',
        required: true,
        dependencies: [],
      }],
      ['google-sheets', {
        name: 'Google Sheets',
        type: 'google',
        required: true,
        dependencies: ['google-workspace'],
      }],
      ['google-drive', {
        name: 'Google Drive',
        type: 'google',
        required: true,
        dependencies: ['google-workspace'],
      }],
      ['google-gmail', {
        name: 'Gmail',
        type: 'google',
        required: true,
        dependencies: ['google-workspace'],
      }],
      ['google-calendar', {
        name: 'Google Calendar',
        type: 'google',
        required: false,
        dependencies: ['google-workspace'],
      }],
      ['google-business', {
        name: 'Google Business Profile',
        type: 'google',
        required: true,
        dependencies: ['google-workspace'],
      }],
      ['google-apps-script', {
        name: 'Google Apps Script',
        type: 'google',
        required: true,
        dependencies: ['google-workspace'],
      }],
      ['google-analytics', {
        name: 'Google Analytics',
        type: 'google',
        required: false,
        dependencies: ['google-workspace'],
      }],
      ['github', {
        name: 'GitHub',
        type: 'github',
        required: true,
        dependencies: [],
      }],
      ['vercel', {
        name: 'Vercel',
        type: 'vercel',
        required: true,
        dependencies: [],
      }],
      ['stripe', {
        name: 'Stripe',
        type: 'stripe',
        required: false,
        dependencies: [],
      }],
      ['twilio', {
        name: 'Twilio',
        type: 'twilio',
        required: false,
        dependencies: [],
      }],
      ['resend', {
        name: 'Resend',
        type: 'resend',
        required: false,
        dependencies: [],
      }],
      ['openai', {
        name: 'OpenAI',
        type: 'openai',
        required: false,
        dependencies: [],
      }],
      ['anthropic', {
        name: 'Anthropic',
        type: 'anthropic',
        required: false,
        dependencies: [],
      }],
    ];
  }

  /**
   * Run full infrastructure audit
   */
  async audit(): Promise<ControllerState> {
    const { runInfrastructureAudit } = await import('./audit');
    const audit = await runInfrastructureAudit();
    
    // Update state based on audit results
    audit.components.forEach(component => {
      const serviceKey = this.mapComponentToService(component.component);
      if (serviceKey) {
        const status: ServiceStatus = {
          name: component.component,
          status: component.status,
          configured: component.layers?.configuration === 'pass',
          connected: component.layers?.connectivity === 'pass',
          operational: component.layers?.capability === 'pass',
          lastChecked: new Date().toISOString(),
          error: component.status === 'error' ? component.message : undefined,
        };
        this.state.services.set(serviceKey, status);
      }
    });

    this.state.lastAudit = new Date().toISOString();
    this.calculateOverallHealth();
    
    return this.state;
  }

  /**
   * Map audit component name to service key
   */
  private mapComponentToService(componentName: string): string | null {
    const mapping: Record<string, string> = {
      'Google Workspace': 'google-workspace',
      'Google Sheets': 'google-sheets',
      'Vercel': 'vercel',
      'GitHub Actions': 'github',
      'Google Apps Script': 'google-apps-script',
      'Cron Jobs': 'google-apps-script', // Maps to Apps Script scheduler
      'Security': 'github',
    };
    return mapping[componentName] || null;
  }

  /**
   * Calculate overall health based on service status
   */
  private calculateOverallHealth(): void {
    const statuses = Array.from(this.state.services.values());
    const requiredServices = statuses.filter(s => {
      const config = this.services.get(s.name);
      return config?.required;
    });

    const hasErrors = requiredServices.some(s => s.status === 'error');
    const hasMissing = requiredServices.some(s => s.status === 'missing');
    const hasDegraded = requiredServices.some(s => s.status === 'degraded');

    if (hasErrors) {
      this.state.overallHealth = 'critical';
    } else if (hasMissing) {
      this.state.overallHealth = 'degraded';
    } else if (hasDegraded) {
      this.state.overallHealth = 'degraded';
    } else {
      this.state.overallHealth = 'healthy';
    }
  }

  /**
   * Get service status
   */
  getServiceStatus(serviceKey: string): ServiceStatus | undefined {
    return this.state.services.get(serviceKey);
  }

  /**
   * Get all services
   */
  getAllServices(): ServiceConfig[] {
    return Array.from(this.services.values());
  }

  /**
   * Get required services that are not healthy
   */
  getUnhealthyRequiredServices(): ServiceStatus[] {
    return Array.from(this.state.services.values()).filter(status => {
      const config = this.services.get(status.name);
      return config?.required && status.status !== 'healthy';
    });
  }

  /**
   * Discover Google resources
   * 
   * Automatically finds and connects to existing Google resources
   * instead of requiring manual ID configuration.
   */
  async discoverGoogleResources(): Promise<{
    found: Record<string, string>;
    missing: string[];
  }> {
    const found: Record<string, string> = {};
    const missing: string[] = [];

    try {
      const { google } = await import('googleapis');
      const oauth2 = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

      // Discover Sheets (use Drive API to list spreadsheets)
      try {
        const drive = google.drive({ version: 'v3', auth: oauth2 });
        const response = await drive.files.list({
          q: "mimeType='application/vnd.google-apps.spreadsheet'",
          fields: 'files(id, name)',
        });
        const reviewsSheet = response.data.files?.find(ff => 
          ff.name?.toLowerCase().includes('review') || 
          ff.name?.toLowerCase().includes('happy place')
        );
        if (reviewsSheet) {
          found['sheets'] = reviewsSheet.id || '';
        } else {
          missing.push('Reviews Sheet');
        }
      } catch (error) {
        missing.push('Reviews Sheet');
      }

      // Discover Drive folders
      try {
        const drive = google.drive({ version: 'v3', auth: oauth2 });
        const response = await drive.files.list({
          q: "mimeType='application/vnd.google-apps.folder' and name contains 'Happy Place'",
          fields: 'files(id, name)',
        });
        const happyPlaceFolder = response.data.files?.[0];
        if (happyPlaceFolder) {
          found['drive'] = happyPlaceFolder.id || '';
        } else {
          missing.push('Happy Place Drive folder');
        }
      } catch (error) {
        missing.push('Happy Place Drive folder');
      }

    } catch (error) {
      console.error('Discovery failed:', error);
    }

    return { found, missing };
  }

  /**
   * Auto-configure discovered resources
   */
  async autoConfigure(discovered: Record<string, string>): Promise<void> {
    // In a real implementation, this would update environment variables
    // or secure storage with discovered IDs
    console.log('Auto-configuring discovered resources:', discovered);
  }

  /**
   * Print controller status
   */
  printStatus(): void {
    console.log('\n' + '='.repeat(60));
    console.log('INFRASTRUCTURE CONTROLLER STATUS');
    console.log('='.repeat(60));
    console.log(`Overall Health: ${this.state.overallHealth.toUpperCase()}`);
    console.log(`Last Audit: ${this.state.lastAudit}`);
    
    console.log('\nServices:');
    Array.from(this.state.services.entries()).forEach(([key, status]) => {
      const icon = status.status === 'healthy' ? '✅' : 
                   status.status === 'degraded' ? '⚠️' :
                   status.status === 'missing' ? '❌' : '🚨';
      console.log(`  ${icon} ${key}: ${status.status}`);
      console.log(`     Configured: ${status.configured ? '✅' : '❌'}`);
      console.log(`     Connected: ${status.connected ? '✅' : '❌'}`);
      console.log(`     Operational: ${status.operational ? '✅' : '❌'}`);
    });

    const unhealthy = this.getUnhealthyRequiredServices();
    if (unhealthy.length > 0) {
      console.log('\nUnhealthy Required Services:');
      unhealthy.forEach(s => {
        console.log(`  • ${s.name}: ${s.error || s.status}`);
      });
    }

    console.log('='.repeat(60) + '\n');
  }
}

// Singleton instance
let controllerInstance: InfrastructureController | null = null;

export function getInfrastructureController(): InfrastructureController {
  if (!controllerInstance) {
    controllerInstance = new InfrastructureController();
  }
  return controllerInstance;
}
