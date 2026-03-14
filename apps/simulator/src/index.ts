import { SimulationClock } from '@eloc2/shared-utils';

const clock = new SimulationClock(Date.now());

console.log('ELOC2 Simulator initialized');
console.log(`Simulation time: ${clock.now()}`);

export { clock };
