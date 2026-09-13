{ pkgs, lib, ... }:
pkgs.testers.nixosTest {
  name = "app-test-vm";
  nodes.machine = {
    imports = [
      ../modules/deploy-system.nix
      ./base-config.nix
    ];

    # disable
    app.enable = false;

    environment.systemPackages = [
      (pkgs.callPackage ../pkgs/app-test.nix { }) # installs our application service
    ];
  };

  testScript = ''
    machine.wait_for_unit("multi-user.target")
    machine.succeed("app-test")
  '';
}
