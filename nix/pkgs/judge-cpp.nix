{
  runCommand,
  symlinkJoin,
  writeShellScriptBin,
  gcc16,
  judge-headers,
}:

let
  precompiledStd =
    runCommand "gcc-precompiled-std"
      {
        nativeBuildInputs = [ gcc16 ];
      }
      ''
        mkdir -p $out/gcm.cache
        cd $(mktemp -d)

        # 1. Compile bits/std.cc and bits/std.compat.cc
        ${gcc16}/bin/g++ -O2 -std=c++26 -freflection -fmodules \
            -fmodule-only -c -fsearch-include-path bits/std.cc

        ${gcc16}/bin/g++ -O2 -std=c++26 -freflection -fmodules \
            -fmodule-only -c -fsearch-include-path bits/std.compat.cc

        # 2. Copy compiled interfaces
        cp gcm.cache/*.gcm $out/gcm.cache/

        # 3. Create the module map file
        # Note: $out is expanded by Bash here to point to this derivation's store path
        cat <<EOF > $out/modules.map
        std $out/gcm.cache/std.gcm
        std.compat $out/gcm.cache/std.compat.gcm
        EOF
      '';

  # The main compiler runner
  judgeGxx = writeShellScriptBin "judge-g++" ''
    exec ${gcc16}/bin/g++ \
      -O2 \
      -std=c++26 \
      -freflection \
      -fmodules \
      -fmodule-mapper=${precompiledStd}/modules.map \
      -isystem ${judge-headers}/include \
      "$@"
  '';

  # Alias so you can call either `judge-c++` or `judge-g++`
  judgeCxxAlias = writeShellScriptBin "judge-c++" ''
    exec ${judgeGxx}/bin/judge-g++ "$@"
  '';

in
symlinkJoin {
  name = "judge-gxx";
  paths = [
    judgeGxx
    judgeCxxAlias
  ];
}
