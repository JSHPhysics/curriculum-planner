#!/usr/bin/env node
/**
 * Generate `public/example_physics_spec.xlsx` from the inline spec definition
 * below. This is the demo "Load bundled example" file the EmptyWorkspace
 * surface fetches, and the same file `examples/example_physics_spec.xlsx`
 * (kept under version control so a fresh checkout can boot without re-running
 * this script).
 *
 * The spec is a representative slice of Edexcel 1PH0 Triple Physics: ~75
 * lessons across all 15 topics. It's a development fixture, not a teaching
 * document — sub-topic boundaries and depth tags are tuned to exercise every
 * import path (multi-objective lessons, practicals, depth flags, separate-only
 * flags, multi-paper assignments, empty optional cells) and to give the
 * preset-layout algorithms enough material to produce visibly distinct plans.
 *
 * Run with `npm run build:example-spec` after editing the data below; the
 * outputs are committed so CI doesn't need to re-run this script.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import XLSX from "xlsx";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const OUT_DIRS = [
  resolve(ROOT, "examples"),
  resolve(ROOT, "public"),
];
const OUT_FILE = "example_physics_spec.xlsx";

// Spec column headers per SPEC.md §5.1
const HEADERS = [
  "Topic",
  "Lesson No.",
  "Lesson Title",
  "Sub-topic",
  "Objectives",
  "Practical",
  "Difficulty",
  "Extra-depth",
  "Separate science only?",
  "Paper",
  "Notes",
];

// One row = one lesson. Objectives separated by "\n" within a single cell.
// Lessons are unique by (Topic, Sub-topic, Lesson No.).
//
// Conventions:
//   Difficulty 1 = foundation / accessible, 2 = standard, 3 = challenge
//   Extra-depth "yes" = depth extension (only placed when Show-depth is on)
//   Separate science only "yes" = triple-only content
//   Paper "1", "2", or "1 & 2" matches the Edexcel 1PH0 paper allocation
const ROWS = [
  // ============================================================
  // T1 Key concepts of physics — Papers 1 & 2 (cross-cutting)
  // ============================================================
  ["Key concepts of physics", 1, "SI units and prefixes", "Units and measurement",
    "Use SI base units (m, kg, s, A) correctly\nConvert between prefixes from pico to giga\nWrite numbers in standard form to appropriate significant figures",
    "", 1, "", "", "1 & 2", "Foundation thread — revisit throughout."],
  ["Key concepts of physics", 2, "Scalars and vectors", "Units and measurement",
    "Distinguish between scalar and vector quantities\nGive examples of each (mass vs weight, distance vs displacement, speed vs velocity)\nRepresent vectors graphically using arrows",
    "", 2, "", "", "1 & 2", ""],
  ["Key concepts of physics", 3, "Significant figures and uncertainties", "Working scientifically",
    "Quote answers to appropriate significant figures\nIdentify sources of uncertainty in experimental measurements\nDistinguish between systematic and random errors",
    "", 2, "", "", "1 & 2", ""],
  ["Key concepts of physics", 4, "Graphs and gradients", "Working scientifically",
    "Plot data on appropriately-scaled axes\nDetermine the gradient of a straight-line graph\nInterpret gradient and area-under-curve in physical contexts",
    "", 2, "", "", "1 & 2", ""],

  // ============================================================
  // T2 Motion and forces — Paper 1
  // ============================================================
  ["Motion and forces", 1, "Distance and displacement", "Kinematics",
    "Distinguish distance from displacement\nCalculate average speed from distance and time\nInterpret distance-time graphs for constant speed",
    "", 1, "", "", "1", ""],
  ["Motion and forces", 2, "Speed-time graphs", "Kinematics",
    "Plot speed-time graphs from data\nCalculate distance travelled as area under a speed-time graph\nInterpret motion described by a speed-time graph",
    "", 2, "", "", "1", ""],
  ["Motion and forces", 3, "Acceleration", "Acceleration and Newton's laws",
    "Define acceleration as rate of change of velocity\nApply v = u + at\nCalculate acceleration from gradient of velocity-time graph",
    "", 2, "", "", "1", ""],
  ["Motion and forces", 4, "Equations of motion", "Acceleration and Newton's laws",
    "Apply v² = u² + 2as to motion under constant acceleration\nSolve multi-step kinematics problems",
    "", 3, "", "", "1", ""],
  ["Motion and forces", 5, "Newton's first and second laws", "Acceleration and Newton's laws",
    "State Newton's first law\nApply F = ma to determine the resultant force, mass or acceleration\nIdentify when an object is in equilibrium",
    "CP1 Force and acceleration", 2, "", "", "1", ""],
  ["Motion and forces", 6, "Newton's third law and free body diagrams", "Acceleration and Newton's laws",
    "State Newton's third law\nIdentify Newton's third law pairs\nDraw free body diagrams for stationary and moving objects",
    "", 2, "", "", "1", ""],
  ["Motion and forces", 7, "Terminal velocity (depth)", "Acceleration and Newton's laws",
    "Explain terminal velocity in terms of changing resultant force\nApply Newton's laws to falling objects with air resistance\nSketch velocity-time graphs for falling objects",
    "", 3, "yes", "", "1", "Depth extension — not required for foundation tier."],
  ["Motion and forces", 8, "Momentum and impulse", "Momentum",
    "Define momentum as p = mv\nApply conservation of momentum to collisions in one dimension\nCalculate impulse as change in momentum",
    "", 3, "", "yes", "1", "Triple-only content."],
  ["Motion and forces", 9, "Stopping distances", "Stopping distances",
    "Define thinking distance, braking distance and stopping distance\nIdentify factors affecting each\nEstimate stopping distances at common road speeds",
    "", 2, "", "", "1", ""],

  // ============================================================
  // T3 Conservation of energy — Paper 1
  // ============================================================
  ["Conservation of energy", 1, "Energy stores and transfers", "Energy stores",
    "Identify energy stores (kinetic, gravitational, elastic, thermal, chemical, nuclear, electrostatic, magnetic)\nDescribe energy transfers between stores\nDraw energy transfer diagrams",
    "", 1, "", "", "1", ""],
  ["Conservation of energy", 2, "Kinetic and gravitational PE", "Energy calculations",
    "Calculate kinetic energy using KE = ½mv²\nCalculate gravitational PE using GPE = mgh\nSolve problems involving conversion between KE and GPE",
    "", 2, "", "", "1", ""],
  ["Conservation of energy", 3, "Specific heat capacity", "Energy calculations",
    "Define specific heat capacity\nCalculate thermal energy using E = mcΔθ\nMeasure specific heat capacity experimentally",
    "CP2 Specific heat capacity", 2, "", "", "1", ""],
  ["Conservation of energy", 4, "Conservation and efficiency", "Efficiency",
    "State the principle of conservation of energy\nCalculate efficiency as useful energy / total energy\nIdentify wasted energy in real systems",
    "", 2, "", "", "1", ""],
  ["Conservation of energy", 5, "Heating and cooling curves (depth)", "Efficiency",
    "Interpret heating and cooling curves for state changes\nRelate plateau regions to latent heat\nCalculate energy required for state changes using E = mL",
    "", 3, "yes", "", "1", "Depth — links to T14 particle model."],

  // ============================================================
  // T4 Waves — Paper 1
  // ============================================================
  ["Waves", 1, "Wave properties", "Wave basics",
    "Define amplitude, wavelength, frequency, period and wave speed\nDistinguish transverse and longitudinal waves\nGive examples of each type",
    "", 1, "", "", "1", ""],
  ["Waves", 2, "The wave equation", "Wave basics",
    "Apply v = f × λ to calculate wave speed, frequency or wavelength\nMeasure wavelength and frequency of waves experimentally",
    "CP3 Waves investigation", 2, "", "", "1", ""],
  ["Waves", 3, "Reflection and refraction", "Wave behaviour",
    "Apply the law of reflection (angle of incidence = angle of reflection)\nDescribe refraction qualitatively\nDraw ray diagrams for refraction at a plane boundary",
    "", 2, "", "", "1", ""],
  ["Waves", 4, "Snell's law (depth)", "Wave behaviour",
    "Apply Snell's law n₁ sin θ₁ = n₂ sin θ₂\nCalculate refractive index from wave speeds\nExplain total internal reflection",
    "", 3, "yes", "", "1", "Depth extension."],
  ["Waves", 5, "Sound waves", "Sound and ultrasound",
    "Describe sound as a longitudinal pressure wave\nState the range of human hearing\nDescribe applications of ultrasound in medicine and industry",
    "", 1, "", "yes", "1", "Triple-only sub-topic."],

  // ============================================================
  // T5 Light and the electromagnetic spectrum — Paper 1
  // ============================================================
  ["Light and the electromagnetic spectrum", 1, "The electromagnetic spectrum", "EM spectrum",
    "List the seven EM regions in order of frequency\nState that EM waves are transverse and travel at the speed of light in a vacuum\nGive a typical application of each region",
    "", 1, "", "", "1", ""],
  ["Light and the electromagnetic spectrum", 2, "Uses and dangers of EM waves", "EM spectrum",
    "Match common uses to EM regions (microwaves, X-rays, etc.)\nIdentify hazards of each region (heating, ionisation, mutation)\nSuggest protective measures",
    "", 2, "", "", "1", ""],
  ["Light and the electromagnetic spectrum", 3, "Lenses and image formation", "Light and lenses",
    "Distinguish converging and diverging lenses\nDraw ray diagrams for converging lenses (object beyond, at, and inside focal length)\nDescribe images formed (real/virtual, magnified/diminished)",
    "", 2, "", "yes", "1", "Triple-only."],
  ["Light and the electromagnetic spectrum", 4, "Visible light and colour", "Light and lenses",
    "Explain colour of opaque objects in terms of reflected wavelengths\nExplain colour through filters in terms of transmitted wavelengths\nDescribe specular and diffuse reflection",
    "", 1, "", "", "1", ""],
  ["Light and the electromagnetic spectrum", 5, "Black body radiation (depth)", "Light and lenses",
    "Describe a perfect black body as an idealised emitter and absorber\nRelate radiation emitted to surface temperature qualitatively\nLink to Earth's energy balance and climate",
    "", 3, "yes", "yes", "1", "Depth + triple-only."],

  // ============================================================
  // T6 Radioactivity — Paper 1
  // ============================================================
  ["Radioactivity", 1, "Atomic structure", "Atomic model",
    "Describe the nuclear model of the atom (Rutherford / Bohr)\nState relative charges and masses of protons, neutrons and electrons\nUse nuclear notation",
    "", 1, "", "", "1", ""],
  ["Radioactivity", 2, "Isotopes", "Atomic model",
    "Define isotope\nIdentify isotopes from nuclear notation\nState that isotopes have the same chemical properties but different physical properties",
    "", 1, "", "", "1", ""],
  ["Radioactivity", 3, "Types of radiation", "Radioactive decay",
    "Describe alpha, beta, gamma and neutron radiation\nState their relative penetrating powers and ionising abilities\nIdentify suitable absorbers for each",
    "", 2, "", "", "1", ""],
  ["Radioactivity", 4, "Half-life", "Radioactive decay",
    "Define half-life\nCalculate half-life from a decay curve\nUse half-life to predict remaining activity after a given time",
    "", 3, "", "", "1", ""],
  ["Radioactivity", 5, "Nuclear equations", "Radioactive decay",
    "Balance nuclear equations for alpha and beta decay\nIdentify the daughter nuclide from a given decay\nDistinguish nuclear fission from nuclear fusion",
    "", 3, "", "", "1", ""],
  ["Radioactivity", 6, "Background radiation and dose", "Radiation in society",
    "Identify natural and man-made sources of background radiation\nDistinguish absorbed dose from equivalent dose\nDiscuss factors affecting radiation risk",
    "", 2, "", "", "1", ""],
  ["Radioactivity", 7, "Medical uses of radiation (depth)", "Radiation in society",
    "Describe diagnostic uses (tracers, imaging)\nDescribe therapeutic uses (cancer treatment)\nEvaluate benefits and risks of each",
    "", 3, "yes", "yes", "1", "Depth + triple-only."],

  // ============================================================
  // T7 Astronomy — Paper 1
  // ============================================================
  ["Astronomy", 1, "The Solar System", "Solar System and orbits",
    "Describe the structure of the Solar System (Sun, planets, moons, asteroids, comets)\nDistinguish geocentric and heliocentric models historically",
    "", 1, "", "", "1", ""],
  ["Astronomy", 2, "Orbits and gravity", "Solar System and orbits",
    "Explain orbital motion as continuous change in velocity\nRelate orbital radius and orbital speed qualitatively (smaller radius → higher speed)\nDistinguish circular and elliptical orbits",
    "", 2, "", "", "1", ""],
  ["Astronomy", 3, "Life cycle of stars", "Stars and the universe",
    "Describe the life cycle of a star (nebula → main sequence → giant → final state)\nDistinguish the fate of stars of different masses\nState that fusion in stars produces elements up to iron",
    "", 2, "", "", "1", ""],
  ["Astronomy", 4, "Red-shift and the Big Bang (depth)", "Stars and the universe",
    "Describe red-shift of galactic light as evidence of expansion\nState that more distant galaxies show greater red-shift\nEvaluate red-shift as evidence for the Big Bang",
    "", 3, "yes", "", "1", "Depth — links to T4 waves."],

  // ============================================================
  // T8 Energy — Forces doing work — Paper 1
  // ============================================================
  ["Energy - Forces doing work", 1, "Work done", "Work, power, energy",
    "Define work done as energy transferred by a force (W = Fd)\nCalculate work done in everyday situations\nState the units of work (joule)",
    "", 1, "", "", "1", ""],
  ["Energy - Forces doing work", 2, "Power", "Work, power, energy",
    "Define power as rate of energy transfer (P = E/t)\nCalculate power in mechanical and electrical contexts\nCompare power ratings of common appliances",
    "", 2, "", "", "1", ""],

  // ============================================================
  // T9 Forces and their effects — Paper 2
  // ============================================================
  ["Forces and their effects", 1, "Forces as vectors", "Forces and equilibrium",
    "Identify common contact and non-contact forces\nResolve a force into perpendicular components qualitatively\nDescribe equilibrium as zero resultant force and zero resultant moment",
    "", 2, "", "", "2", ""],
  ["Forces and their effects", 2, "Moments and turning forces", "Forces and equilibrium",
    "Define a moment as M = F × d\nApply the principle of moments to balanced systems\nGive examples of levers in everyday life",
    "", 2, "", "", "2", ""],
  ["Forces and their effects", 3, "Pressure in fluids (depth)", "Pressure",
    "Calculate pressure as P = F/A\nApply P = ρgh for hydrostatic pressure\nExplain upthrust and floating in terms of pressure differences",
    "", 3, "yes", "yes", "2", "Depth + triple-only."],

  // ============================================================
  // T10 Electricity and circuits — Paper 2
  // ============================================================
  ["Electricity and circuits", 1, "Circuit symbols", "DC circuits",
    "Recognise standard circuit symbols (cell, battery, lamp, switch, resistor, voltmeter, ammeter, LED, diode, thermistor, LDR)\nDraw simple series and parallel circuits using correct symbols",
    "", 1, "", "", "2", ""],
  ["Electricity and circuits", 2, "Current, voltage and resistance", "DC circuits",
    "Define current as rate of charge flow (I = Q/t)\nDefine potential difference\nApply V = IR (Ohm's law) and rearrange",
    "CP9 I-V characteristics", 2, "", "", "2", ""],
  ["Electricity and circuits", 3, "Series and parallel circuits", "DC circuits",
    "State and apply rules for current and voltage in series circuits\nState and apply rules for current and voltage in parallel circuits\nCompare total resistance of series vs parallel arrangements qualitatively",
    "", 2, "", "", "2", ""],
  ["Electricity and circuits", 4, "I-V characteristics", "DC circuits",
    "Plot I-V characteristics for a fixed resistor, filament lamp and diode\nInterpret each in terms of changing resistance\nDescribe how a thermistor and LDR respond to temperature and light",
    "CP10 Resistance of a wire", 3, "", "", "2", ""],
  ["Electricity and circuits", 5, "Electrical power and energy (depth)", "Power and energy in circuits",
    "Apply P = IV and P = I²R to calculate power\nApply E = Pt and E = IVt to calculate energy transferred\nCalculate the cost of running an appliance given a unit cost",
    "", 3, "yes", "", "2", "Depth — calculations heavy."],
  ["Electricity and circuits", 6, "Mains electricity and safety", "Power and energy in circuits",
    "Identify live, neutral and earth wires by colour\nDescribe the function of fuses, circuit breakers and earthing\nDistinguish AC from DC and state UK mains values",
    "", 2, "", "", "2", ""],

  // ============================================================
  // T11 Static electricity — Paper 2
  // ============================================================
  ["Static electricity", 1, "Charging by friction", "Electrostatics",
    "Describe charging insulators by friction in terms of electron transfer\nExplain attraction and repulsion in terms of like and unlike charges\nGive examples of useful and dangerous static",
    "", 2, "", "yes", "2", "Triple-only topic."],
  ["Static electricity", 2, "Electric fields (depth)", "Electrostatics",
    "Define an electric field as a region where charges experience a force\nSketch field patterns around point charges and parallel plates\nExplain sparking in terms of high field strength ionising air",
    "", 3, "yes", "yes", "2", "Depth + triple-only."],

  // ============================================================
  // T12 Magnetism and the motor effect — Paper 2
  // ============================================================
  ["Magnetism and the motor effect", 1, "Magnetic fields", "Magnetism basics",
    "Describe magnetic fields around bar magnets and the Earth\nSketch field lines using plotting compasses\nDistinguish induced and permanent magnets",
    "", 1, "", "", "2", ""],
  ["Magnetism and the motor effect", 2, "Electromagnets", "Magnetism basics",
    "Sketch the magnetic field around a current-carrying wire and a solenoid\nDescribe factors affecting electromagnet strength (current, turns, core)\nGive examples of electromagnet applications (relays, scrap yards, MRI)",
    "", 2, "", "", "2", ""],
  ["Magnetism and the motor effect", 3, "The motor effect", "The motor effect",
    "State that a current-carrying conductor in a magnetic field experiences a force\nApply F = BIL\nUse Fleming's left-hand rule to predict force direction",
    "", 3, "", "", "2", ""],
  ["Magnetism and the motor effect", 4, "DC motors (depth)", "The motor effect",
    "Describe the construction and operation of a simple DC motor\nExplain the role of the split-ring commutator\nIdentify factors affecting motor speed and direction",
    "", 3, "yes", "yes", "2", "Depth + triple-only."],

  // ============================================================
  // T13 Electromagnetic induction — Paper 2
  // ============================================================
  ["Electromagnetic induction", 1, "Induced voltage", "Induction basics",
    "State that a changing magnetic field induces a voltage in a conductor\nDescribe factors affecting induced voltage (rate of change, number of turns, field strength)\nApply the right-hand grip rule",
    "", 3, "", "yes", "2", "Triple-only topic."],
  ["Electromagnetic induction", 2, "Transformers and the National Grid", "Transformers",
    "Describe the structure of a transformer (primary, secondary, iron core)\nApply Vp/Vs = Np/Ns for ideal transformers\nExplain why high voltages are used for transmission",
    "", 3, "", "yes", "2", "Triple-only."],

  // ============================================================
  // T14 Particle model — Paper 2
  // ============================================================
  ["Particle model", 1, "States of matter", "Density and states",
    "Describe arrangement and motion of particles in solids, liquids and gases\nLink kinetic energy of particles to temperature\nUse the particle model to explain state changes",
    "", 1, "", "", "2", ""],
  ["Particle model", 2, "Density", "Density and states",
    "Apply ρ = m/V to calculate density\nMeasure density of regular and irregular solids experimentally\nMeasure density of liquids using a measuring cylinder and balance",
    "CP12 Density investigation", 2, "", "", "2", ""],
  ["Particle model", 3, "Internal energy and temperature", "Internal energy",
    "Define internal energy as the sum of kinetic and potential energies of particles\nDistinguish temperature from heat\nDescribe what happens to internal energy when a substance is heated or changes state",
    "", 2, "", "", "2", ""],
  ["Particle model", 4, "Latent heat (depth)", "Internal energy",
    "Define specific latent heat of fusion and vaporisation\nCalculate energy required for state changes using E = mL\nInterpret heating curves quantitatively",
    "", 3, "yes", "yes", "2", "Depth + triple-only — pairs with T3 cooling curves."],
  ["Particle model", 5, "Gas laws (depth)", "Gas behaviour",
    "Describe gas pressure in terms of particle collisions\nState and apply pV = constant at constant temperature (Boyle's law)\nRelate temperature changes to pressure or volume changes qualitatively",
    "", 3, "yes", "yes", "2", "Depth + triple-only."],

  // ============================================================
  // T15 Forces and matter — Paper 2
  // ============================================================
  ["Forces and matter", 1, "Forces and elasticity", "Elastic behaviour",
    "Distinguish elastic and inelastic deformation\nApply F = ke (Hooke's law)\nDescribe how to investigate the spring constant of a spring experimentally",
    "CP14 Force-extension", 2, "", "", "2", ""],
  ["Forces and matter", 2, "Energy stored in a spring", "Elastic behaviour",
    "Calculate elastic PE using E = ½ke²\nInterpret force-extension graphs (area under = work done)\nIdentify the limit of proportionality on a force-extension graph",
    "", 3, "", "", "2", ""],
  ["Forces and matter", 3, "Stretching and the limit of proportionality (depth)", "Elastic behaviour",
    "Describe non-linear regions of force-extension graphs\nDistinguish elastic and plastic deformation in materials\nGive examples of materials with different stress-strain behaviour",
    "", 3, "yes", "yes", "2", "Depth + triple-only."],
];

function buildWorksheet() {
  const aoa = [HEADERS, ...ROWS];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Set column widths (in xlsx "character units"; roughly mirrors the Python defaults)
  const widths = [22, 9, 32, 28, 56, 26, 9, 11, 18, 8, 28];
  ws["!cols"] = widths.map((w) => ({ wch: w }));

  // Freeze header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  return ws;
}

async function main() {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheet();
  XLSX.utils.book_append_sheet(wb, ws, "Spec");

  // SheetJS write returns a Node Buffer when type: "buffer"
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  for (const dir of OUT_DIRS) {
    await mkdir(dir, { recursive: true });
    const out = resolve(dir, OUT_FILE);
    await writeFile(out, buf);
    console.log(`  wrote ${out}`);
  }

  const topics = new Set(ROWS.map((r) => r[0]));
  const subTopics = new Set(ROWS.map((r) => `${r[0]}|${r[3]}`));
  console.log(`\nDemo spec stats:`);
  console.log(`  ${ROWS.length} lessons`);
  console.log(`  ${topics.size} topics`);
  console.log(`  ${subTopics.size} sub-topics`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
