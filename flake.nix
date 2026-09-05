{
  description = "A very basic flake";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
    bun2nix.url = "github:nix-community/bun2nix";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
  };

  nixConfig = {
    extra-substituters = [
      "https://nix-community.cachix.org"
    ];
    extra-trusted-public-keys = [
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
    ];
  };

  outputs =
    {
      self,
      nixpkgs,
      ...
    }:
    let
      system = "x86_64-linux";
      overlays = import ./nix/overlays.nix { inherit self; };
      pkgs = import nixpkgs {
        inherit system overlays;
      };
    in
    {
      nixosConfigurations = {

      };

      packages.${system} = rec {
        app = import ./nix/pkgs/app.nix { inherit pkgs; };
      };
    };

}
