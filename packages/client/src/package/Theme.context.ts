/******************************************************************************************
 * Repository: https://github.com/kolserdav/uyem.git
 * File name: Theme.context.ts
 * Author: Sergey Kolmiller
 * Email: <uyem.ru@gmail.com>
 * License: BSD-2-Clause
 * License text: Binary distributions of this software include 'wrtc' and other third-party libraries.
 * Copyright: kolserdav, All rights reserved (c)
 * Create Date: Tue Jun 21 2022 08:49:55 GMT+0700 (Krasnoyarsk Standard Time)
 ******************************************************************************************/
/* eslint-disable no-unused-vars */
import { createContext } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { themes } from './Theme';

// eslint-disable-next-line import/prefer-default-export
const ThemeContext = createContext(themes.dark);

export default ThemeContext;
