import { type Listener, Port } from "./Listener.ts";

/** What a positional argument refers to: a port, or a directory the listener runs in. */
export type Target =
  | { readonly _tag: "Port"; readonly port: Port }
  | { readonly _tag: "Directory"; readonly fragment: string };

/**
 * All digits is a port (`3000`); anything else is a directory fragment
 * (`circles`, `acme/apps`). A directory literally named `3000` can be given
 * as `3000/`. Throws on an out-of-range port.
 */
export const parseTarget = (text: string): Target =>
  /^\d+$/.test(text)
    ? { _tag: "Port", port: Port.make(Number(text)) }
    : { _tag: "Directory", fragment: text };

const pathSegments = (path: string): Array<string> =>
  path.split("/").filter((segment) => segment !== "");

/**
 * Whether `cwd` contains `fragment` as whole path segments: `circles` matches
 * `~/Code/circles/apps/web` but not `~/Code/circles-old`. A fragment starting
 * with `/` must match from the root. A fragment without segments (`""`, `/`)
 * matches nothing, so a typo can never select every listener.
 */
export const isInDirectory = (cwd: string, fragment: string): boolean => {
  const needle = pathSegments(fragment);
  const haystack = pathSegments(cwd);

  if (needle.length === 0) {
    return false;
  }

  const matchesAt = (start: number) =>
    needle.every((segment, offset) => haystack[start + offset] === segment);

  if (fragment.startsWith("/")) {
    return matchesAt(0);
  }

  return haystack.some((_, start) => matchesAt(start));
};

const matchesTarget = (listener: Listener, target: Target): boolean =>
  target._tag === "Port"
    ? listener.port === target.port
    : listener.cwd !== null && isInDirectory(listener.cwd, target.fragment);

/**
 * GUI apps and system daemons are started by launchd/init with `/` as their
 * working directory, whereas dev servers run inside a project.
 */
const isSystemListener = (listener: Listener) => listener.cwd === "/";

/**
 * With targets, everything matching any of them; explicitly requested
 * listeners are never hidden. Without, every listener, minus system ones
 * unless `includeSystem`.
 */
export const selectListeners = (
  listeners: ReadonlyArray<Listener>,
  {
    targets,
    includeSystem,
  }: {
    readonly targets: ReadonlyArray<Target>;
    readonly includeSystem: boolean;
  },
): ReadonlyArray<Listener> => {
  if (targets.length > 0) {
    return listeners.filter((listener) =>
      targets.some((target) => matchesTarget(listener, target)),
    );
  }

  return includeSystem
    ? listeners
    : listeners.filter((listener) => !isSystemListener(listener));
};

/** e.g. `on :3000, in circles`, for "nothing matched" errors. */
export const describeTargets = (targets: ReadonlyArray<Target>): string =>
  targets
    .map((target) =>
      target._tag === "Port" ? `on :${target.port}` : `in ${target.fragment}`,
    )
    .join(", ");
