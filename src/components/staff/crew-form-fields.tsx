import { CREW_SPECIALIZATIONS, SPECIALIZATION_LABELS } from "@/lib/domain/categories";
import { CREW_STATUSES, CREW_STATUS_LABELS } from "@/lib/domain/types";

interface CrewDefaults {
  name: string;
  specialization: string;
  status: string;
  baseLabel: string;
  baseLatitude: number | string;
  baseLongitude: number | string;
  capacity: number;
  shiftNotes: string | null;
}

const EMPTY_DEFAULTS: CrewDefaults = {
  name: "",
  specialization: "general_maintenance",
  status: "available",
  baseLabel: "",
  baseLatitude: "",
  baseLongitude: "",
  capacity: 2,
  shiftNotes: "",
};

/** Field set shared by the "add crew" and "edit crew" forms. `idPrefix` keeps ids unique per form. */
export function CrewFormFields({ idPrefix, defaults = EMPTY_DEFAULTS }: { idPrefix: string; defaults?: CrewDefaults }) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2">
        <label htmlFor={id("name")} className="label">Crew name</label>
        <input id={id("name")} name="name" className="input" required minLength={2} maxLength={80} defaultValue={defaults.name} />
      </div>
      <div>
        <label htmlFor={id("specialization")} className="label">Specialisation</label>
        <select id={id("specialization")} name="specialization" className="input" defaultValue={defaults.specialization}>
          {CREW_SPECIALIZATIONS.map((key) => <option key={key} value={key}>{SPECIALIZATION_LABELS[key]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={id("status")} className="label">Availability</label>
        <select id={id("status")} name="status" className="input" defaultValue={defaults.status}>
          {CREW_STATUSES.map((key) => <option key={key} value={key}>{CREW_STATUS_LABELS[key]}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={id("baseLabel")} className="label">Operating base (name or address)</label>
        <input id={id("baseLabel")} name="baseLabel" className="input" required minLength={2} maxLength={120} defaultValue={defaults.baseLabel} />
      </div>
      <div>
        <label htmlFor={id("baseLatitude")} className="label">Base latitude</label>
        <input id={id("baseLatitude")} name="baseLatitude" className="input" inputMode="decimal" required defaultValue={defaults.baseLatitude} placeholder="-26.2041" />
      </div>
      <div>
        <label htmlFor={id("baseLongitude")} className="label">Base longitude</label>
        <input id={id("baseLongitude")} name="baseLongitude" className="input" inputMode="decimal" required defaultValue={defaults.baseLongitude} placeholder="28.0473" />
      </div>
      <div>
        <label htmlFor={id("capacity")} className="label">Capacity (concurrent jobs)</label>
        <input id={id("capacity")} name="capacity" type="number" min={1} max={20} className="input" required defaultValue={defaults.capacity} />
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <label htmlFor={id("shiftNotes")} className="label">Shift information (optional)</label>
        <input id={id("shiftNotes")} name="shiftNotes" className="input" maxLength={300} defaultValue={defaults.shiftNotes ?? ""} placeholder="For example: weekdays 07:00 to 16:00" />
      </div>
    </div>
  );
}
