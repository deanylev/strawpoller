import { helper } from '@ember/component/helper';

export function titleCase(params/*, hash*/) {
  const string = params[0];
  return `${string.slice(0, 1).toUpperCase()}${string.slice(1)}`;
}

export default helper(titleCase);
