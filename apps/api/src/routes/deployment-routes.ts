import type { FastifyInstance } from 'fastify';
import {
  optimize,
  validateDeployment,
  generateGrid,
  coverageScore,
  geometryScore,
  threatScore,
  exportToSensorDefinitions,
  isCellCovered,
} from '@eloc2/deployment-planner';
import type {
  SensorSpec,
  DeploymentConstraints,
  PlacedSensor,
  SavedDeployment,
  GeoPolygon,
  GeoPoint,
} from '@eloc2/deployment-planner';
import fs from 'node:fs';
import path from 'node:path';

// Directory for persisted deployment JSON files
const DEPLOYMENTS_DIR = path.resolve(
  process.cwd(),
  'configs',
  'deployments',
);

/** Ensure the deployments directory exists. */
function ensureDir(): void {
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  }
}

/** Build the file path for a deployment id. */
function deploymentPath(id: string): string {
  // Sanitise id to prevent directory traversal
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(DEPLOYMENTS_DIR, `${safe}.json`);
}

/** Read a single deployment from disk (or null). */
function readDeployment(id: string): SavedDeployment | null {
  const fp = deploymentPath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw) as SavedDeployment;
  } catch {
    return null;
  }
}

/** Write a deployment to disk. */
function writeDeployment(d: SavedDeployment): void {
  ensureDir();
  fs.writeFileSync(deploymentPath(d.id), JSON.stringify(d, null, 2), 'utf-8');
}

/** List all saved deployments from disk. */
function listDeployments(): SavedDeployment[] {
  ensureDir();
  const files = fs.readdirSync(DEPLOYMENTS_DIR).filter(f => f.endsWith('.json'));
  const results: SavedDeployment[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DEPLOYMENTS_DIR, file), 'utf-8');
      results.push(JSON.parse(raw) as SavedDeployment);
    } catch {
      // skip malformed files
    }
  }
  return results;
}

// Counter for generating unique ids (scan existing files to avoid collisions)
let nextId = 1;
function initCounter(): void {
  ensureDir();
  const files = fs.readdirSync(DEPLOYMENTS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const match = file.match(/^deploy-(\d+)\.json$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n >= nextId) nextId = n + 1;
    }
  }
}

/**
 * Deployment planning API routes (REQ-15).
 */
export function registerDeploymentRoutes(app: FastifyInstance) {
  // Initialise id counter from existing files
  initCounter();

  // POST /api/deployment/optimize — Run optimization with constraints
  app.post<{
    Body: {
      sensors: SensorSpec[];
      constraints: DeploymentConstraints;
    };
  }>('/api/deployment/optimize', async (request) => {
    const { sensors, constraints } = request.body;
    const result = optimize(sensors, constraints);
    return result;
  });

  // POST /api/deployment/score-position — Score a single position
  app.post<{
    Body: {
      position: GeoPoint;
      sensor: SensorSpec;
      constraints: DeploymentConstraints;
      placedSensors: PlacedSensor[];
    };
  }>('/api/deployment/score-position', async (request) => {
    const { position, sensor, constraints, placedSensors } = request.body;
    const resolution = constraints.gridResolutionM || 1000;
    const cells = generateGrid(constraints.scannedArea, resolution);
    const coveredMask = cells.map(() => false);

    // Mark cells covered by already-placed sensors
    for (let i = 0; i < cells.length; i++) {
      for (const ps of placedSensors) {
        if (isCellCovered(ps.position, ps.spec, cells[i])) {
          coveredMask[i] = true;
          break;
        }
      }
    }

    const cov = coverageScore(position, sensor, cells, coveredMask);
    const geo = geometryScore(position, placedSensors, cells);
    const thr = threatScore(position, sensor, cells, constraints.threatCorridors);
    const total = 0.5 * cov + 0.3 * geo + 0.2 * thr;

    return { coverage: cov, geometry: geo, threat: thr, total };
  });

  // POST /api/deployment/validate — Check if deployment meets requirements
  app.post<{
    Body: {
      placedSensors: PlacedSensor[];
      constraints: DeploymentConstraints;
    };
  }>('/api/deployment/validate', async (request) => {
    const { placedSensors, constraints } = request.body;
    const resolution = constraints.gridResolutionM || 1000;
    const cells = generateGrid(constraints.scannedArea, resolution);
    const metrics = validateDeployment(placedSensors, cells);
    const meetsRequirements = metrics.coveragePercent >= (constraints.minCoveragePercent || 0);
    return { metrics, meetsRequirements };
  });

  // POST /api/deployment/export-scenario — Convert to ScenarioDefinition sensor format
  app.post<{
    Body: { placedSensors: PlacedSensor[] };
  }>('/api/deployment/export-scenario', async (request) => {
    const { placedSensors } = request.body;
    const sensorDefs = exportToSensorDefinitions(placedSensors);
    return { sensors: sensorDefs };
  });

  // POST /api/deployment/save — Save deployment to JSON file
  app.post<{
    Body: {
      name: string;
      sensors: SensorSpec[];
      constraints: DeploymentConstraints;
      result: { placedSensors: PlacedSensor[]; metrics: any };
    };
  }>('/api/deployment/save', async (request) => {
    const { name, sensors, constraints, result } = request.body;
    const id = `deploy-${nextId++}`;
    const saved: SavedDeployment = {
      id,
      name,
      createdAt: new Date().toISOString(),
      constraints,
      sensors,
      result,
    };
    writeDeployment(saved);
    return { id, name, createdAt: saved.createdAt };
  });

  // GET /api/deployment/list — List saved deployments (reads directory)
  app.get('/api/deployment/list', async () => {
    const all = listDeployments();
    return all.map(d => ({
      id: d.id,
      name: d.name,
      createdAt: d.createdAt,
      sensorCount: d.result.placedSensors.length,
      coveragePercent: d.result.metrics.coveragePercent,
    }));
  });

  // GET /api/deployment/:id — Load deployment from JSON file
  app.get<{ Params: { id: string } }>('/api/deployment/:id', async (request, reply) => {
    const deployment = readDeployment(request.params.id);
    if (!deployment) {
      reply.code(404);
      return { error: 'Deployment not found' };
    }
    return deployment;
  });

  // POST /api/deployment/export-to-scenario — Export deployment as scenario sensor config
  app.post<{
    Body: {
      deploymentId?: string;
      placedSensors?: PlacedSensor[];
      scenarioName?: string;
      durationSec?: number;
    };
  }>('/api/deployment/export-to-scenario', async (request, reply) => {
    let sensors: PlacedSensor[];

    if (request.body.deploymentId) {
      const deployment = readDeployment(request.body.deploymentId);
      if (!deployment) {
        reply.code(404);
        return { error: 'Deployment not found' };
      }
      sensors = deployment.result.placedSensors;
    } else if (request.body.placedSensors) {
      sensors = request.body.placedSensors;
    } else {
      reply.code(400);
      return { error: 'Must provide either deploymentId or placedSensors' };
    }

    // Convert placed sensors to scenario SensorDefinition format
    const sensorDefinitions = exportToSensorDefinitions(sensors);
    const scenarioId = `deployment-${Date.now()}`;

    return {
      id: scenarioId,
      name: request.body.scenarioName ?? 'Deployment Export',
      description: `Scenario generated from deployment with ${sensors.length} sensors`,
      durationSec: request.body.durationSec ?? 600,
      policyMode: 'auto_with_veto',
      sensors: sensorDefinitions,
      targets: [],  // User adds targets via scenario editor or injection
      faults: [],
      operatorActions: [],
    };
  });
}
