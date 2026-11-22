import { PRIORITY_COLORS } from "@/components/ui/badges";
import type { Plan } from "@/lib/engines/assignment";
import type { SimulatorCrew, SimulatorIncident } from "./planning-simulator";

interface ScenarioSchematicProps {
  incidents: SimulatorIncident[];
  crews: SimulatorCrew[];
  /** When given, lines are drawn from each crew base to its assigned incidents. */
  plan: Plan | null;
}

const VIEW_SIZE = 560;
const PADDING = 44;
const GRID_HALF_EXTENT_KM = 3.5;
const CREW_COLOR = "#082d52";

const toX = (eastKm: number) => PADDING + ((eastKm + GRID_HALF_EXTENT_KM) / (2 * GRID_HALF_EXTENT_KM)) * (VIEW_SIZE - 2 * PADDING);
const toY = (northKm: number) => VIEW_SIZE - PADDING - ((northKm + GRID_HALF_EXTENT_KM) / (2 * GRID_HALF_EXTENT_KM)) * (VIEW_SIZE - 2 * PADDING);

/**
 * Plain grid drawing of the synthetic scenario. It is deliberately not a
 * street map: the scenario's positions are invented and must not look like
 * real places.
 */
export function ScenarioSchematic({ incidents, crews, plan }: ScenarioSchematicProps) {
  const gridLines = [-3, -2, -1, 0, 1, 2, 3];
  const crewById = new Map(crews.map((crew) => [crew.id, crew]));
  const incidentById = new Map(incidents.map((incident) => [incident.id, incident]));

  return (
    <figure className="rounded-lg border border-line bg-white p-4">
      <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="mx-auto w-full max-w-xl" role="img" aria-labelledby="schematic-title schematic-description">
        <title id="schematic-title">Schematic of the synthetic training scenario</title>
        <desc id="schematic-description">
          A grid in kilometres showing {incidents.length} synthetic incidents and {crews.length} crew bases.
          {plan ? ` Lines show the ${plan.assignments.length} assignments of the Civitas plan.` : ""} The same information is listed in the tables on this page.
        </desc>
        <rect x={PADDING} y={PADDING} width={VIEW_SIZE - 2 * PADDING} height={VIEW_SIZE - 2 * PADDING} fill="#f6f8fa" stroke="#d9e0e8" />
        {gridLines.map((value) => (
          <g key={value}>
            <line x1={toX(value)} y1={PADDING} x2={toX(value)} y2={VIEW_SIZE - PADDING} stroke="#d9e0e8" strokeDasharray={value === 0 ? undefined : "3 4"} />
            <line x1={PADDING} y1={toY(value)} x2={VIEW_SIZE - PADDING} y2={toY(value)} stroke="#d9e0e8" strokeDasharray={value === 0 ? undefined : "3 4"} />
            <text x={toX(value)} y={VIEW_SIZE - PADDING + 16} textAnchor="middle" fontSize="11" fill="#51627a">{value}</text>
            <text x={PADDING - 8} y={toY(value) + 4} textAnchor="end" fontSize="11" fill="#51627a">{value}</text>
          </g>
        ))}
        <text x={VIEW_SIZE / 2} y={VIEW_SIZE - 6} textAnchor="middle" fontSize="11" fill="#51627a">km east of scenario origin</text>
        <text x={12} y={VIEW_SIZE / 2} textAnchor="middle" fontSize="11" fill="#51627a" transform={`rotate(-90 12 ${VIEW_SIZE / 2})`}>km north</text>

        {plan?.assignments.map((assignment) => {
          const crew = crewById.get(assignment.crewId);
          const incident = incidentById.get(assignment.incidentId);
          if (!crew || !incident || crew.eastKm === undefined || crew.northKm === undefined || incident.eastKm === undefined || incident.northKm === undefined) return null;
          return (
            <line
              key={assignment.incidentId}
              x1={toX(crew.eastKm)}
              y1={toY(crew.northKm)}
              x2={toX(incident.eastKm)}
              y2={toY(incident.northKm)}
              stroke="#168f95"
              strokeWidth={2}
            />
          );
        })}

        {crews.map((crew) =>
          crew.eastKm === undefined || crew.northKm === undefined ? null : (
            <g key={crew.id} opacity={crew.status === "available" ? 1 : 0.35}>
              <rect x={toX(crew.eastKm) - 7} y={toY(crew.northKm) - 7} width={14} height={14} fill={CREW_COLOR} stroke="#ffffff" strokeWidth={2} />
              <text x={toX(crew.eastKm)} y={toY(crew.northKm) + 21} textAnchor="middle" fontSize="10" fill={CREW_COLOR}>{crew.name}</text>
            </g>
          ),
        )}
        {incidents.map((incident) =>
          incident.eastKm === undefined || incident.northKm === undefined ? null : (
            <g key={incident.id}>
              <circle cx={toX(incident.eastKm)} cy={toY(incident.northKm)} r={8} fill={PRIORITY_COLORS[incident.priorityBand]} stroke="#ffffff" strokeWidth={2} />
              <text x={toX(incident.eastKm)} y={toY(incident.northKm) - 12} textAnchor="middle" fontSize="10" fontWeight="600" fill="#10233b">{incident.label}</text>
            </g>
          ),
        )}
      </svg>
      <figcaption className="mt-2 text-center text-xs text-ink-muted">
        Synthetic training data on a plain kilometre grid. Circles are incidents coloured by priority; squares are crew
        bases (faded when unavailable); lines show the current Civitas plan. This is not a map of any real place.
      </figcaption>
    </figure>
  );
}
