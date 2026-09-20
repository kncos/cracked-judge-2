#pragma once

#include <meta>
#include <glaze/glaze.hpp>

#include <array>
#include <concepts>
#include <expected>
#include <format>
#include <functional>
#include <iostream>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <tuple>
#include <type_traits>
#include <utility>
#include <vector>

namespace test_runner {

// 1. Generic test case structure capturing unknown JSON fields as kwargs
struct TestCase {
  std::string fn;
  std::optional<glz::raw_json> expect;
  std::map<std::string, glz::raw_json> kwargs;
};

struct TestSuite {
  std::vector<TestCase> data;
};

} // namespace test_runner

template <>
struct glz::meta<test_runner::TestCase> {
  using T = test_runner::TestCase;
  static constexpr auto value = glz::object("fn", &T::fn, "expect", &T::expect);
  static constexpr auto unknown_read = &T::kwargs;
};

namespace test_runner {

// 2. Reflection Helpers
consteval bool is_callable_op(std::meta::info m) {
  return std::meta::is_function(m) && std::meta::has_identifier(m);
}

template <typename T>
consteval size_t count_callable_ops() {
  size_t count = 0;
  auto ctx = std::meta::access_context::current();
  for (auto m : std::meta::members_of(^^T, ctx)) {
    if (is_callable_op(m)) ++count;
  }
  return count;
}

template <typename T>
consteval auto get_callable_ops() {
  constexpr size_t N = count_callable_ops<T>();
  std::array<std::meta::info, N> arr{};
  size_t idx = 0;
  auto ctx = std::meta::access_context::current();
  for (auto m : std::meta::members_of(^^T, ctx)) {
    if (is_callable_op(m)) arr[idx++] = m;
  }
  return arr;
}

template <std::meta::info Fn>
consteval size_t get_param_count() {
  return std::meta::parameters_of(Fn).size();
}

template <std::meta::info Fn, size_t Index>
consteval std::string_view get_param_name() {
  return std::meta::identifier_of(std::meta::parameters_of(Fn)[Index]);
}

template <std::meta::info Fn, size_t Index>
consteval std::meta::info get_param_type() {
  return std::meta::type_of(std::meta::parameters_of(Fn)[Index]);
}

template <std::meta::info Fn, size_t... Is>
auto make_args_tuple_helper(std::index_sequence<Is...>) {
  return std::type_identity<
      std::tuple<typename [: get_param_type<Fn, Is>() :]...>>{};
}

template <std::meta::info Fn>
consteval auto get_args_tuple_type() {
  constexpr size_t count = get_param_count<Fn>();
  return make_args_tuple_helper<Fn>(std::make_index_sequence<count>{});
}

template <std::meta::info Fn>
using ArgsTupleFor = typename decltype(get_args_tuple_type<Fn>())::type;

template <size_t N>
consteval auto make_index_array() {
  std::array<size_t, N> arr{};
  for (size_t i = 0; i < N; ++i) arr[i] = i;
  return arr;
}

// 3. Dispatch a single call against an instance (supporting stateful non-static methods)
template <typename Target>
std::expected<std::string, std::string> execute_call(
    Target& target,
    const TestCase& test) 
{
  static constexpr auto members = get_callable_ops<Target>();

  template for (constexpr auto mem : members) {
    if (test.fn == std::meta::identifier_of(mem)) {
      constexpr size_t param_count = get_param_count<mem>();
      static constexpr auto indices = make_index_array<param_count>();

      using ArgsTuple = ArgsTupleFor<mem>;
      ArgsTuple args{};

      // Deserialize each named parameter
      template for (constexpr size_t I : indices) {
        constexpr std::string_view name = get_param_name<mem, I>();

        auto it = test.kwargs.find(std::string(name));
        if (it == test.kwargs.end()) {
          return std::unexpected(std::format(
              "Missing parameter '{}' for function '{}'", name, test.fn));
        }

        using ParamType = std::tuple_element_t<I, ArgsTuple>;
        auto parse_res = glz::read_json<ParamType>(it->second.str);
        if (!parse_res) {
          return std::unexpected(std::format(
              "Failed to parse parameter '{}': {}",
              name,
              glz::format_error(parse_res.error(), it->second.str)));
        }

        std::get<I>(args) = std::move(parse_res.value());
      }

      // Universal invoker: handles both static and non-static member functions
      auto invoker = [&](auto&&... unpacked_args) {
        if constexpr (std::is_member_function_pointer_v<decltype(&[: mem :])>) {
          return std::invoke(&[: mem :], target, std::forward<decltype(unpacked_args)>(unpacked_args)...);
        } else {
          return std::invoke(&[: mem :], std::forward<decltype(unpacked_args)>(unpacked_args)...);
        }
      };

      // Handle return type and check expectation
      constexpr auto ret_type = std::meta::return_type_of(mem);
      if constexpr (ret_type == ^^void) {
        std::apply(invoker, args);
        return "void";
      } else {
        using RetType = typename [: ret_type :];
        RetType result = std::apply(invoker, args);

        if (test.expect) {
          auto exp_res = glz::read_json<RetType>(test.expect->str);
          if (!exp_res) {
            return std::unexpected(std::format(
                "Failed to parse 'expect' for '{}': {}",
                test.fn,
                glz::format_error(exp_res.error(), test.expect->str)));
          }

          if (result != exp_res.value()) {
            return std::unexpected(std::format(
                "Call '{}' failed: expected {}, got {}",
                test.fn,
                glz::write_json(exp_res.value()).value_or("?"),
                glz::write_json(result).value_or("?")));
          }
        }

        return glz::write_json(result).value_or("");
      }
    }
  }

  return std::unexpected(std::format("Unknown function: '{}'", test.fn));
}

// 4. Public API to run a test suite against an instance
template <typename Target>
bool run(Target& target, std::string_view json) {
  constexpr auto opts = glz::opts{.error_on_unknown_keys = false};
  TestSuite suite{};
  auto ec = glz::read<opts>(suite, json);
  if (ec) {
    std::cerr << glz::format_error(ec, json) << "\n";
    return false;
  }

  std::cout << std::format("Running {} test cases...\n", suite.data.size());

  for (size_t i = 0; i < suite.data.size(); ++i) {
    auto result = execute_call(target, suite.data[i]);
    if (!result) {
      std::cout << std::format(
          "[FAIL] Case {}/{}: {}\n", i + 1, suite.data.size(), result.error());
      return false;
    }
    std::cout << std::format(
        "[PASS] Case {}/{}: {} -> {}\n",
        i + 1,
        suite.data.size(),
        suite.data[i].fn,
        result.value());
  }

  return true;
}

// Convenience overload for default-constructible / stateless classes
template <typename Target>
  requires std::is_default_constructible_v<Target>
bool run(std::string_view json) {
  Target target{};
  return run(target, json);
}

} // namespace test_runner
