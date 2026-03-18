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

// In-memory store for saved deployments
const savedDeployments = new Map<string, SavedDeployment>();
let nextId = 1;

/**
 * Deployment planning API routes (REQ-15).
 */
export function registerDeploymentRoutes(app: FastifyInstance) {
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

  // POST /api/deployment/save — Save deployment
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
    savedDeployments.set(id, saved);
    return { id, name, createdAt: saved.createdAt };
  });

  // GET /api/deployment/list — List saved deployments
  app.get('/api/deployment/list', async () => {
    return Array.from(savedDeployments.values()).map(d => ({
      id: d.id,
      name: d.name,
      createdAt: d.createdAt,
      sensorCount: d.result.placedSensors.length,
      coveragePercent: d.result.metrics.coveragePercent,
    }));
  });

  // GET /api/deployment/:id — Load deployment
  app.get<{ Params: { id: string } }>('/api/deployment/:id', async (request, reply) => {
    const deployment = savedDeployments.get(request.params.id);
    if (!deployment) {
      reply.code(404);
      return { error: 'Deployment not found' };
    }
    return deployment;
  });
}
