#!/usr/bin/env node
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import {
  Config,
  Console,
  Effect,
  Layer,
  Option,
  Stdio,
  Terminal,
} from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";

import packageJson from "../package.json" with { type: "json" };
import { PortScanner, type ScanError } from "./PortScanner.ts";
import { type RenderOptions, renderDetail, renderTable } from "./render.ts";
import {
  type Target,
  describeTargets,
  parseTarget,
  selectListeners,
} from "./select.ts";

const toUserError = (error: ScanError) =>
  new CliError.UserError({ cause: error, userMessage: error.message });

const scanListeners = PortScanner.use((scanner) => scanner.listeners).pipe(
  Effect.mapError(toUserError),
);

const nothingListening = (targets: ReadonlyArray<Target>) =>
  new CliError.UserError({
    cause: null,
    userMessage: `Nothing is listening ${describeTargets(targets)}`,
  });

/** Colour and truncation only make sense on an interactive terminal. Honours https://no-color.org. */
const renderOptions = Effect.gen(function* () {
  const isTerminal = yield* Stdio.Stdio.use((stdio) => stdio.stdoutIsTerminal);
  const noColor = yield* Config.String("NO_COLOR").pipe(Config.option);
  const home = yield* Config.String("HOME").pipe(Config.withDefault(""));
  const width = isTerminal
    ? yield* Terminal.Terminal.use((terminal) => terminal.columns)
    : Infinity;

  return {
    color: isTerminal && Option.isNone(noColor),
    width,
    home,
  } satisfies RenderOptions;
});

const targetsArgument = (description: string) =>
  Argument.String("port|dir").pipe(
    Argument.mapTryCatch(
      parseTarget,
      () => "Ports must be between 1 and 65535",
    ),
    Argument.withDescription(description),
  );

const pls = Command.make(
  "pls",
  {
    targets: targetsArgument(
      "Ports (shown in full detail) or directories, e.g. `3000` or `circles`",
    ).pipe(Argument.variadic()),
    all: Flag.Boolean("all").pipe(
      Flag.withAlias("a"),
      Flag.withDescription(
        "Include system services and GUI apps (those running from `/`)",
      ),
      Flag.withDefault(false),
    ),
    json: Flag.Boolean("json").pipe(
      Flag.withDescription("Print machine-readable JSON"),
      Flag.withDefault(false),
    ),
  },
  Effect.fn(function* ({ all, json, targets }) {
    const listeners = yield* scanListeners;
    const selected = selectListeners(listeners, {
      targets,
      includeSystem: all,
    });

    if (json) {
      return yield* Console.log(JSON.stringify(selected, null, 2));
    }

    if (targets.length > 0 && selected.length === 0) {
      return yield* nothingListening(targets);
    }

    const options = yield* renderOptions;

    // Asking for specific ports means wanting to inspect them; a directory can hold many servers.
    if (targets.length > 0 && targets.every(({ _tag }) => _tag === "Port")) {
      return yield* Console.log(
        selected
          .map((listener) => renderDetail(listener, options))
          .join("\n\n"),
      );
    }

    // Only the default view hides anything; targets select explicitly.
    const hiddenCount =
      targets.length === 0 ? listeners.length - selected.length : 0;

    yield* Console.log(
      renderTable({ listeners: selected, hiddenCount }, options),
    );
  }),
).pipe(
  Command.withDescription(
    "See which processes are listening on which TCP ports, where they run and what started them",
  ),
  Command.withExamples([
    {
      command: "pls",
      description: "List listening ports, hiding system services",
    },
    { command: "pls --all", description: "List every listening port" },
    {
      command: "pls 3000 5173",
      description: "Show details for specific ports",
    },
    {
      command: "pls circles",
      description: "List servers running anywhere under a `circles` directory",
    },
    { command: "pls --json", description: "Print listeners as JSON" },
  ]),
);

const kill = Command.make(
  "kill",
  {
    targets: targetsArgument(
      "Ports, or directories whose servers should all be stopped, e.g. `3000` or `circles`",
    ).pipe(Argument.variadic({ min: 1 })),
    force: Flag.Boolean("force").pipe(
      Flag.withAlias("f"),
      Flag.withDescription("Send SIGKILL instead of SIGTERM"),
      Flag.withDefault(false),
    ),
  },
  Effect.fn(function* ({ force, targets }) {
    const scanner = yield* PortScanner;
    const listeners = yield* scanListeners;
    // Same selection as `pls`, so `pls circles` previews exactly what `pls kill circles` stops.
    const requested = selectListeners(listeners, {
      targets,
      includeSystem: false,
    });

    // One process can listen on several of the requested ports; signal it only once.
    const processes = new Map(
      requested.map((listener) => [listener.pid, listener]),
    )
      .values()
      .toArray();

    if (processes.length === 0) {
      return yield* nothingListening(targets);
    }

    const signal = force ? "KILL" : "TERM";

    for (const process of processes) {
      yield* scanner
        .kill(process.pid, signal)
        .pipe(Effect.mapError(toUserError));
      yield* Console.log(
        `Sent SIG${signal} to ${process.label} (pid ${process.pid}) on :${process.port}`,
      );
    }
  }),
).pipe(
  Command.withDescription(
    "Stop whatever is listening on the given port(s) or under a directory",
  ),
  Command.withExamples([
    {
      command: "pls kill 3000",
      description: "Gracefully stop the server on :3000",
    },
    {
      command: "pls kill -f 3000 3001",
      description: "Force-kill servers on :3000 and :3001",
    },
    {
      command: "pls kill circles",
      description: "Stop every server running under a `circles` directory",
    },
  ]),
);

pls.pipe(
  Command.withSubcommands([kill]),
  Command.run({ version: packageJson.version }),
  Effect.provide(
    PortScanner.layer.pipe(Layer.provideMerge(NodeServices.layer)),
  ),
  NodeRuntime.runMain,
);
