# CloudPulse – Multi-Cloud Health Monitor

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js Version](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Multi-Cloud](https://img.shields.io/badge/Clouds-AWS%20|%20Azure%20|%20GCP-orange.svg)](#cloud-integrations)
[![Render Deployable](https://img.shields.io/badge/Deploy-Render-46E3B7.svg)](https://render.com/)

**CloudPulse** is an enterprise-grade, full-stack multi-cloud infrastructure monitoring platform. It unifies performance telemetry, automated threshold alerts, resource health tracking, and comparative workload analytics across the three major hyperscale cloud providers:

1. **Amazon Web Services (AWS)** – Amazon EC2 & CloudWatch
2. **Microsoft Azure** – Azure Virtual Machines, Azure Monitor & Microsoft Entra ID
3. **Google Cloud Platform (GCP)** – Google Compute Engine & Google Cloud Monitoring

Instead of toggling between multiple disparate vendor consoles, CloudPulse delivers a single pane of glass for real-time visibility, resource inventory, historical timeseries charts, and automated incident response.

---

## Architecture Overview

CloudPulse is architected around **strict provider decoupling and fault isolation**. Each cloud integration executes independently:

```
                                 ┌───────────────────────────────────┐
                                 │     CloudPulse Web Application    │
                                 │   Express.js + EJS + Chart.js    │
                                 └─────────────────┬─────────────────┘
                                                   │
                   ┌───────────────────────────────┼──────────────────────────────┐
                   │                               │                              │
                   ▼                               ▼                              ▼
        ┌─────────────────────┐        ┌───────────────────────┐        ┌─────────────────────┐
        │     AWS Service     │        │     Azure Service     │        │     GCP Service     │
        │  Amazon CloudWatch  │        │     Azure Monitor     │        │  Cloud Monitoring   │
        │     Amazon EC2      │        │  Microsoft Entra ID   │        │   Compute Engine    │
        └──────────┬──────────┘        └───────────┬───────────┘        └──────────┬──────────┘
                   │                               │                               │
                   └───────────────────────┬───────┴───────────────────────────────┘
                                           │
                                           ▼
                               ┌───────────────────────┐
                               │     Health Monitor    │
                               │  (Promise.allSettled) │
                               └───────────┬───────────┘
                                           │
                                           ▼
                               ┌───────────────────────┐
                               │     MongoDB Atlas     │
                               │ Resources, Metrics,   │
                               │ Alerts & Connections  │
                               └───────────────────────┘
```

### Architectural Guarantees:
- **Zero Server Crashes on Missing Credentials**: Cloud clients are initialized **lazily**. If Azure or GCP credentials are not yet configured, the system marks the provider as `Configuration Required` or `Not Connected` while the rest of the application runs at 100% capacity.
- **Provider Fault Isolation**: Background monitoring cycles use `Promise.allSettled`. A timeout, network partition, or authentication failure on AWS will never interrupt Azure or GCP monitoring.
- **Credential Safety**: Plaintext client secrets, service account private keys, and session tokens are strictly stored in server-side environment variables and are **never** committed to Git or stored in MongoDB.
- **Duplicate Alert Suppression**: The alert engine dynamically updates active incidents rather than generating duplicate alerts on every polling interval. When metrics recover below thresholds, alerts are auto-resolved.

---

## Core Features

- **Executive Multi-Cloud Dashboard**: Summary counters (Total, Healthy, Warning, Critical resources, Connected providers, Average CPU, Active alerts).
- **Three Dedicated Cloud Provider Cards**: Live status pills, resource distributions, and last synchronization timestamps for AWS, Azure, and GCP.
- **Centralized Resource Inventory**: Searchable and filterable table supporting cloud provider filters, health status, region search, sorting, and pagination.
- **7 Interactive Chart.js Visualizations**:
  1. Multi-cloud CPU utilization over time
  2. Average CPU utilization by provider
  3. Maximum CPU utilization by provider
  4. Resource health distribution
  5. Total resources by cloud provider
  6. Historical performance comparison (Baseline vs Peak)
  7. Alert distribution by severity
- **Time Window Filtering**: Inspect telemetry across `Last 1 Hour`, `Last 6 Hours`, `Last 24 Hours`, `Last 7 Days`, and `Last 30 Days`.
- **CSV Telemetry Export**: One-click download of filtered metric timeseries for auditing and compliance reports.
- **Incident & Alert Management**: View active and historical alerts, filter by cloud provider and severity, and resolve incidents with a single click.
- **Configurable CPU Thresholds**:
  - **Healthy**: $< 70\%$ CPU utilization
  - **Warning**: $70\%$ to $< 90\%$ CPU utilization
  - **Critical**: $\ge 90\%$ CPU utilization
- **Built-in Zero-Cost Demo Mode**: Enables local demonstrations, university presentations, and testing even before live cloud credentials are added.

---

## Technology Stack

- **Backend**: Node.js (v18+), Express.js 5, JavaScript (CommonJS)
- **Frontend**: HTML5, CSS3 (Modern SaaS Light Theme), Vanilla JavaScript, EJS View Engine, Chart.js 4
- **Database**: MongoDB Atlas via Mongoose 9 (compound indexing, timeseries support, upsert idempotency)
- **Official Cloud SDKs**:
  - AWS: `@aws-sdk/client-cloudwatch`, `@aws-sdk/client-ec2`
  - Azure: `@azure/identity`, `@azure/arm-monitor`
  - GCP: `@google-cloud/monitoring`, `@google-cloud/compute`
- **Deployment**: Render Web Service (Free tier compatible, `0.0.0.0` binding, `/health` health-check)

---

## Project Structure

```
MultiCloudHealthMoniter/
├── config/
│   ├── database.js               # MongoDB connection with serverSelectionTimeoutMS
│   └── cloudConfig.js            # Environment validation, provider detection & thresholds
├── models/
│   ├── Resource.js               # Cloud resources with status & telemetry
│   ├── CloudMetric.js            # Timeseries observations with compound unique index
│   ├── Alert.js                  # Incident lifecycle & threshold tracking
│   └── ProviderConnection.js     # Non-secret connection health & error diagnostics
├── routes/
│   ├── dashboard.js              # GET /api/dashboard/summary
│   ├── resources.js              # GET /api/resources (search, filter, pagination)
│   ├── providers.js              # GET /api/providers (status & resource counters)
│   ├── awsMetrics.js             # GET /api/aws/metrics
│   ├── azureMetrics.js           # GET /api/azure/metrics
│   ├── gcpMetrics.js             # GET /api/gcp/metrics
│   ├── metrics.js                # GET /api/metrics/history & /analytics
│   └── alerts.js                 # GET /api/alerts, /active & PATCH /:id/resolve
├── services/
│   ├── awsService.js             # AWS CloudWatch & EC2 metrics fetcher
│   ├── azureService.js           # Azure Monitor VM metrics fetcher (lazy init)
│   ├── gcpService.js             # Google Cloud Monitoring fetcher (lazy init)
│   ├── alertService.js           # Threshold evaluation & duplicate prevention
│   └── healthMonitor.js          # Unified scheduler (Promise.allSettled)
├── views/
│   ├── partials/
│   │   ├── sidebar.ejs           # Responsive navigation sidebar
│   │   └── header.ejs            # Topbar with clock, environment tag, notifications
│   ├── dashboard.ejs             # Overview dashboard
│   ├── providers.ejs             # Cloud provider management & testing
│   ├── resources.ejs             # Centralized resource inventory
│   ├── metrics.ejs               # 7 Chart.js analytics visualizations
│   ├── alerts.ejs                # Incident management & one-click resolution
│   └── settings.ejs              # System settings & configuration guide
├── public/
│   ├── css/
│   │   └── dashboard.css         # Modern light theme stylesheet
│   └── js/
│       ├── dashboard.js          # Overview polling & Chart.js renderer
│       ├── resources.js          # Inventory pagination & filtering
│       ├── metrics.js            # 7 analytics charts & CSV exporter
│       └── alerts.js             # Alert tabs & resolution handler
├── scripts/
│   └── seed.js                   # Demo records seeder (safe: preserves real cloud data)
├── tests/
│   ├── runAllTests.js            # Automated unit & integration test suite
│   └── testServerEndpoints.js    # Comprehensive HTTP endpoint test
├── .env.example                  # Environment variable template
├── .gitignore                    # Git secrets exclusion rules
├── render.yaml                   # Infrastructure-as-Code for Render deployment
├── package.json                  # NPM dependencies & scripts
├── main.js                       # Express bootstrap & lifecycle manager
└── README.md                     # Documentation
```

---

## Getting Started

### 1. Prerequisites
- **Node.js** (v18.0.0 or higher): [Download Node.js](https://nodejs.org/)
- **MongoDB Atlas** account (or local MongoDB community server): [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- **Git** installed on your system.

### 2. Installation
Clone the repository and open the project directory in VS Code:

```bash
git clone https://github.com/your-username/cloudpulse.git
cd cloudpulse/MultiCloudHealthMoniter
```

Install the dependencies:

```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the project root by copying the template:

```bash
cp .env.example .env
```

Open `.env` in VS Code and populate your database URI and credentials:

```env
# Server
PORT=9090
NODE_ENV=development
DEMO_MODE=true
BACKGROUND_MONITORING=true
MONITORING_INTERVAL_MS=60000

# MongoDB Atlas
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/cloudpulse?retryWrites=true&w=majority

# Alert Thresholds
THRESHOLD_CPU_WARNING=70.0
THRESHOLD_CPU_CRITICAL=90.0
```

---

## Cloud Provider Setup Guides

### 1. Amazon Web Services (AWS)
CloudPulse uses the AWS SDK v3 to query CloudWatch EC2 metrics.

**Required IAM Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "ec2:DescribeInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

**Environment Variables**:
```env
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_EC2_INSTANCE_ID=i-01fb627927411c6f6
```

---

### 2. Microsoft Azure
CloudPulse authenticates via **Microsoft Entra ID** (formerly Azure AD) using a Service Principal.

**Steps**:
1. In Azure Portal, navigate to **Microsoft Entra ID** $\rightarrow$ **App registrations** $\rightarrow$ **New registration**.
2. Create a client secret under **Certificates & secrets**.
3. In **Subscriptions**, select your subscription $\rightarrow$ **Access control (IAM)** $\rightarrow$ **Add role assignment** $\rightarrow$ assign **Monitoring Reader** to your registered app.
4. Obtain the **Resource ID** of your target VM (e.g., from the JSON view of the VM blade).

**Environment Variables**:
```env
AZURE_TENANT_ID=your-tenant-id-guid
AZURE_CLIENT_ID=your-client-id-guid
AZURE_CLIENT_SECRET=your-client-secret-value
AZURE_SUBSCRIPTION_ID=your-subscription-id-guid
AZURE_VM_RESOURCE_ID=/subscriptions/SUB_ID/resourceGroups/RG_NAME/providers/Microsoft.Compute/virtualMachines/VM_NAME
```

---

### 3. Google Cloud Platform (GCP)
CloudPulse monitors Google Compute Engine VM instances using the official **Google Cloud Monitoring** Node.js library.

**Steps**:
1. In Google Cloud Console, enable **Cloud Monitoring API** and **Compute Engine API**.
2. Navigate to **IAM & Admin** $\rightarrow$ **Service Accounts** $\rightarrow$ Create a Service Account.
3. Grant the roles:
   - **Monitoring Viewer** (`roles/monitoring.viewer`)
   - **Compute Viewer** (`roles/compute.viewer`)
4. Create a JSON key and download it.

**For Local Development**:
```env
GCP_PROJECT_ID=your-gcp-project-id
GCP_ZONE=us-central1-a
GOOGLE_APPLICATION_CREDENTIALS=./config/gcp-service-account.json
```

**For Render / Production Cloud**:
Instead of storing a physical JSON key file on disk, CloudPulse allows you to paste the service account JSON as an environment variable:
```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project-id",...}
```

---

## Seeding Demo Data

To populate multi-cloud demo resources, historical timeseries observations, and sample alerts without overwriting real cloud records:

```bash
npm run seed
```

---

## Running the Application

### Development Mode (with hot-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:9090
```

---

## Automated Testing

CloudPulse includes a comprehensive automated test suite verifying database models, crash isolation, lazy client initialization, alert deduplication, and HTTP endpoints:

```bash
npm test
```

You can also run the HTTP endpoint suite directly:
```bash
node tests/testServerEndpoints.js
```

---

## REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Health-check endpoint for Render / Kubernetes |
| `GET` | `/api/dashboard/summary` | Summary counters computed dynamically from DB |
| `GET` | `/api/providers` | Real-time connection status & resource counts for AWS, Azure, GCP |
| `GET` | `/api/resources` | Centralized inventory with search, filters, and pagination |
| `GET` | `/api/aws/metrics` | AWS CloudWatch EC2 metrics |
| `GET` | `/api/azure/metrics` | Azure Monitor VM metrics |
| `GET` | `/api/gcp/metrics` | Google Cloud Monitoring VM metrics |
| `GET` | `/api/metrics/history` | Historical metrics with time filters (`1h`, `6h`, `24h`, `7d`, `30d`) |
| `GET` | `/api/metrics/analytics` | Datasets for the 7 interactive Chart.js charts |
| `GET` | `/api/alerts` | All alerts with severity, provider, and status filters |
| `GET` | `/api/alerts/active` | Current active alerts needing attention |
| `PATCH` | `/api/alerts/:id/resolve` | Manually resolve an alert with optional resolution note |

---

## Deploying to Render

CloudPulse is pre-configured for one-click deployment to [Render](https://render.com/) using the included `render.yaml`.

### Step-by-Step Render Deployment:
1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: CloudPulse Multi-Cloud Health Monitor"
   git branch -M main
   git remote add origin https://github.com/your-username/cloudpulse.git
   git push -u origin main
   ```
2. **Create Web Service on Render**:
   - Log into [Render Dashboard](https://dashboard.render.com/).
   - Click **New +** $\rightarrow$ **Web Service**.
   - Connect your GitHub repository.
3. **Configure Build & Start**:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
4. **Configure Environment Variables**:
   In Render's **Environment** tab, set:
   - `MONGODB_URI`: Your MongoDB Atlas connection string.
   - `DEMO_MODE`: `true`
   - `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_EC2_INSTANCE_ID`
   - `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SUBSCRIPTION_ID`, `AZURE_VM_RESOURCE_ID`
   - `GCP_PROJECT_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`
5. **Deploy**:
   Click **Deploy Web Service**. Render will build and deploy the container. Once complete, your application will be live at `https://your-service-name.onrender.com`.

---

## Troubleshooting

- **MongoDB connection timeout**:
  - Verify that your IP address is whitelisted in MongoDB Atlas under **Network Access** (`0.0.0.0/0` allows connections from anywhere, including Render).
  - Verify that the database user credentials in `MONGODB_URI` are correct.
- **Azure shows "Monitoring Error" / "Invalid tenant id"**:
  - Ensure `AZURE_TENANT_ID` is a valid 36-character GUID without surrounding quotes or spaces.
  - If Azure is not yet configured, leave the values blank; CloudPulse will gracefully display Azure as `Configuration Required`.
- **AWS metrics show empty list**:
  - CloudWatch stores EC2 metrics every 5 minutes by default. Verify that your EC2 instance is currently in the `running` state.
  - Verify that `AWS_REGION` matches the region where your instance is hosted.

---

## License

This project is licensed under the ISC License.
