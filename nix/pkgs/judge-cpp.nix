{
  pkgs,
}:
let
  glaze = pkgs.glaze;
  judge-headers = pkgs.callPackage ../pkgs/judge-headers.nix { };
  gcc16 = pkgs.gcc16;

  precompiledStd = pkgs.runCommand "gcc-precompiled-std" { } ''
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
    printf "std %s/gcm.cache/std.gcm\nstd.compat %s/gcm.cache/std.compat.gcm\n" "$out" "$out" > $out/modules.map
  '';

  # The main compiler runner
  judgeGxx = pkgs.writeShellScriptBin "judge-g++" ''
    exec ${gcc16}/bin/g++ \
      -O2 \
      -std=c++26 \
      -freflection \
      -fmodules \
      -fmodule-mapper=${precompiledStd}/modules.map \
      -isystem ${judge-headers}/include \
      -isystem ${glaze}/include \
      "$@"
  '';

  # Alias so you can call either `judge-c++` or `judge-g++`
  judgeCxxAlias = pkgs.writeShellScriptBin "judge-c++" ''
    exec ${judgeGxx}/bin/judge-g++ "$@"
  '';

in
pkgs.symlinkJoin {
  name = "judge-gxx";
  paths = [
    judgeGxx
    judgeCxxAlias
  ];
}
